import { prisma } from '../../../db/prisma.client';
import {
  evaluateDailyActivityStreak,
  getNextStreakMilestone,
  getStreakMilestoneReward,
  isPremiumStreakMilestone,
} from '../../../utils/reward.util';
import { TierUtils } from '../../../utils/tier.utils';
import { NotificationService } from '../../notifications/notification.service';

type PersistedQuizAnswer = {
  questionId: string;
  answer: string;
  attemptCount: number;
  wrongAnswers?: string[];
  isCorrect?: boolean;
};

type QuizQuestionEntity = {
  id: string;
  questionText: string;
  explanation: string | null;
  options: string[];
  correctAnswer: string;
  order: number;
};

function getQuizAttemptMultiplier(attemptCount: number) {
  if (attemptCount <= 1) return 0.7;
  if (attemptCount === 2) return 0.5;
  if (attemptCount === 3) return 0.25;
  if (attemptCount === 4) return 0.2;
  return 0.1;
}

function getQuizDateRange() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return { today, tomorrow };
}

function normalizePersistedAnswers(rawAnswers: unknown): PersistedQuizAnswer[] {
  if (!Array.isArray(rawAnswers)) return [];

  const normalized: PersistedQuizAnswer[] = [];

  for (const item of rawAnswers) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const questionId = typeof entry.questionId === 'string' ? entry.questionId : '';
    if (!questionId) continue;

    const answer = typeof entry.answer === 'string' ? entry.answer : '';
    const attemptCount = typeof entry.attemptCount === 'number' && Number.isFinite(entry.attemptCount)
      ? Math.max(0, Math.floor(entry.attemptCount))
      : 0;
    const wrongAnswers = Array.isArray(entry.wrongAnswers)
      ? entry.wrongAnswers.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : [];
    const isCorrect = typeof entry.isCorrect === 'boolean' ? entry.isCorrect : undefined;

    normalized.push({
      questionId,
      answer,
      attemptCount,
      wrongAnswers,
      isCorrect,
    });
  }

  return normalized;
}

function buildQuizPayload(
  quiz: { id: string; title: string; rewardSats: number; xpReward: number; questions: QuizQuestionEntity[] },
) {
  return {
    id: quiz.id,
    title: quiz.title,
    description: 'Keep guessing until you get each answer right. More wrong tries reduce that question\'s reward.',
    rewardSats: quiz.rewardSats,
    xpReward: quiz.xpReward,
    questions: quiz.questions.map((question) => ({
      id: question.id,
      questionText: question.questionText,
      explanation: question.explanation,
      options: question.options,
      order: question.order,
      correctAnswer: question.correctAnswer,
    })),
  };
}

function buildInProgressResult(
  quiz: { title: string; rewardSats: number; xpReward: number; questions: QuizQuestionEntity[] },
  persistedAnswers: PersistedQuizAnswer[],
) {
  const totalQuestions = quiz.questions.length;
  const baseSatsPerQuestion = totalQuestions > 0 ? quiz.rewardSats / totalQuestions : 0;
  const baseXpPerQuestion = totalQuestions > 0 ? quiz.xpReward / totalQuestions : 0;
  const answerMap = new Map(persistedAnswers.map((item) => [item.questionId, item]));

  let rewardEarned = 0;
  let xpEarned = 0;
  let totalAttempts = 0;
  let solvedCount = 0;

  const review = quiz.questions
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((question) => {
      const savedAnswer = answerMap.get(question.id);
      const selectedAnswer = savedAnswer?.answer || '';
      const wrongAnswers = savedAnswer?.wrongAnswers || [];
      const attemptCount = Math.max(savedAnswer?.attemptCount || wrongAnswers.length || 0, wrongAnswers.length);
      const isCorrect = selectedAnswer === question.correctAnswer;
      const multiplier = getQuizAttemptMultiplier(Math.max(1, attemptCount || 1));
      const questionReward = isCorrect ? Math.floor(baseSatsPerQuestion * multiplier) : 0;
      const questionXp = isCorrect ? Math.floor(baseXpPerQuestion * multiplier) : 0;

      totalAttempts += attemptCount;
      if (isCorrect) {
        solvedCount += 1;
        rewardEarned += questionReward;
        xpEarned += questionXp;
      }

      return {
        questionId: question.id,
        questionText: question.questionText,
        explanation: question.explanation,
        selectedAnswer,
        correctAnswer: question.correctAnswer,
        isCorrect,
        attemptCount: Math.max(1, attemptCount || 1),
        rewardAwarded: questionReward,
        xpAwarded: questionXp,
        options: question.options,
        order: question.order,
        wrongAnswers,
      };
    });

  return {
    message: solvedCount === totalQuestions
      ? `Quiz solved! Finalizing your reward now.`
      : `Progress saved. ${solvedCount}/${totalQuestions} questions solved so far.`,
    passed: solvedCount === totalQuestions,
    score: solvedCount,
    rewardEarned,
    xpEarned,
    streakBonusSats: 0,
    totalQuestions,
    maxRewardSats: quiz.rewardSats,
    maxXpReward: quiz.xpReward,
    totalAttempts,
    quizTitle: quiz.title,
    quizDescription: 'Keep guessing until you get each answer right. More wrong tries reduce that question\'s reward.',
    review,
  };
}

export class UserQuizService {
  static async submitQuizTask(userId: string, taskId: string, answers: string[]) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { campaign: true },
    });

    if (!task) throw new Error('Task not found');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { premiumTier: true, premiumExpiresAt: true },
    });

    if (!user) throw new Error('User not found');

    const hasPremium = TierUtils.isPremiumActive(user as any);
    if (task.campaign.isPremiumOnly && !hasPremium) {
      throw new Error('This task is available for premium members only.');
    }

    const existingSubmission = await prisma.submission.findUnique({
      where: { userId_taskId: { userId, taskId } },
    });

    if (existingSubmission) {
      throw new Error('You have already completed this quiz task.');
    }

    return {
      passed: true,
      answers,
      message: 'Quiz submission recorded. Task flow can continue.',
    };
  }

  static async claimStreakBonus(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, currentStreak: true, lastClaimedStreakMilestone: true },
    });

    if (!user) throw new Error('User not found');

    const nextMilestone = getNextStreakMilestone(user.lastClaimedStreakMilestone);
    if (!nextMilestone) {
      throw new Error('All streak milestones have already been claimed.');
    }

    return {
      message: `Streak bonuses are now awarded automatically on activity completion. Next reward unlocks at ${nextMilestone} days.`,
      currentStreak: user.currentStreak,
      nextMilestone,
    };
  }

  static async startTaskFlow(userId: string, taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { campaign: true },
    });

    if (!task) throw new Error('Task not found.');
    if (!task.campaign.isActive) throw new Error('This campaign has ended.');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { premiumTier: true, premiumExpiresAt: true },
    });

    if (!user) throw new Error('User not found.');

    const hasPremium = TierUtils.isPremiumActive(user as any);
    if (task.campaign.isPremiumOnly && !hasPremium) {
      throw new Error('This task is available for premium members only.');
    }

    const existing = await prisma.submission.findUnique({
      where: { userId_taskId: { userId, taskId } },
    });

    if (existing) {
      throw new Error('You already started or completed this task.');
    }

    return {
      taskId: task.id,
      taskTitle: task.title,
      campaignTitle: task.campaign.title,
      instructions: task.description,
      targetUrl: task.targetUrl || task.campaign.targetUrl,
      proofType: task.proofType,
      requirements: task.requirements,
    };
  }

  static async getTodayQuiz(userId: string) {
    const { today, tomorrow } = getQuizDateRange();

    const quiz = await prisma.dailyQuiz.findFirst({
      where: {
        isActive: true,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!quiz) {
      throw new Error('There is no active quiz for today. Check back tomorrow!');
    }

    const quizPayload = buildQuizPayload(quiz as any);
    const existingAttempt = await prisma.quizAttempt.findUnique({
      where: { userId_dailyQuizId: { userId, dailyQuizId: quiz.id } },
    });

    if (!existingAttempt) {
      return {
        status: 'available' as const,
        quiz: quizPayload,
      };
    }

    const savedAnswers = normalizePersistedAnswers(existingAttempt.answers);
    const inProgressResult = buildInProgressResult(quiz as any, savedAnswers);
    const isCompleted = existingAttempt.passed && existingAttempt.score >= quiz.questions.length;

    return {
      status: isCompleted ? 'submitted' as const : 'available' as const,
      quiz: quizPayload,
      result: {
        ...inProgressResult,
        message: isCompleted
          ? `Quiz completed! You earned ${inProgressResult.rewardEarned} sats based on your answer attempts.`
          : inProgressResult.message,
        submittedAt: existingAttempt.createdAt,
      },
    };
  }

  static async submitDailyQuizAnswer(userId: string, questionId: string, answer: string) {
    const { today, tomorrow } = getQuizDateRange();

    const quiz = await prisma.dailyQuiz.findFirst({
      where: {
        isActive: true,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!quiz) throw new Error('Quiz not found or has expired.');

    const question = quiz.questions.find((item) => item.id === questionId);
    if (!question) throw new Error('Invalid question selected.');

    const existingAttempt = await prisma.quizAttempt.findUnique({
      where: { userId_dailyQuizId: { userId, dailyQuizId: quiz.id } },
    });

    if (existingAttempt?.passed && existingAttempt.score >= quiz.questions.length) {
      throw new Error("You have already completed today's quiz.");
    }

    const persistedAnswers = normalizePersistedAnswers(existingAttempt?.answers);
    const answerMap = new Map(persistedAnswers.map((item) => [item.questionId, item]));
    const current = answerMap.get(questionId) || {
      questionId,
      answer: '',
      attemptCount: 0,
      wrongAnswers: [],
      isCorrect: false,
    };

    if (current.isCorrect || current.answer === question.correctAnswer) {
      throw new Error('This question is already solved.');
    }

    const wrongAnswers = [...(current.wrongAnswers || [])];
    if (wrongAnswers.includes(answer)) {
      throw new Error('You have already tried this option. Choose a different one.');
    }

    const nextAttemptCount = (current.attemptCount || 0) + 1;
    const isCorrect = answer === question.correctAnswer;

    const updatedEntry: PersistedQuizAnswer = {
      questionId,
      answer: isCorrect ? answer : current.answer || '',
      attemptCount: nextAttemptCount,
      wrongAnswers: isCorrect ? wrongAnswers : [...wrongAnswers, answer],
      isCorrect,
    };

    answerMap.set(questionId, updatedEntry);
    const updatedAnswers = quiz.questions
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => answerMap.get(item.id))
      .filter((item): item is PersistedQuizAnswer => Boolean(item));

    if (!existingAttempt) {
      await prisma.quizAttempt.create({
        data: {
          userId,
          dailyQuizId: quiz.id,
          answers: updatedAnswers,
          score: 0,
          passed: false,
        },
      });
    } else {
      await prisma.quizAttempt.update({
        where: { id: existingAttempt.id },
        data: {
          answers: updatedAnswers,
          score: updatedAnswers.filter((item) => item.isCorrect).length,
          passed: updatedAnswers.filter((item) => item.isCorrect).length === quiz.questions.length,
        },
      });
    }

    const solvedCount = updatedAnswers.filter((item) => item.isCorrect).length;
    const isQuizComplete = solvedCount === quiz.questions.length;

    if (isQuizComplete) {
      return {
        status: 'submitted' as const,
        questionId,
        isCorrect: true,
        result: await this.finalizeDailyQuiz(userId, quiz.id, updatedAnswers),
      };
    }

    return {
      status: 'in_progress' as const,
      questionId,
      isCorrect,
      attemptCount: nextAttemptCount,
      wrongAnswers: updatedEntry.wrongAnswers || [],
      selectedAnswer: isCorrect ? answer : '',
      message: isCorrect
        ? `Correct on try ${nextAttemptCount}.`
        : `Wrong answer. Try a different option. Attempt ${nextAttemptCount} saved.`,
      progress: {
        solvedQuestions: solvedCount,
        totalQuestions: quiz.questions.length,
      },
      result: buildInProgressResult(quiz as any, updatedAnswers),
    };
  }

  static async submitDailyQuiz(
    userId: string,
    userAnswers: Array<{ questionId: string; answer: string; attemptCount: number }>,
  ) {
    const { today, tomorrow } = getQuizDateRange();

    const quiz = await prisma.dailyQuiz.findFirst({
      where: {
        isActive: true,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
      include: { questions: true },
    });

    if (!quiz) throw new Error('Quiz not found or has expired.');
    return this.finalizeDailyQuiz(userId, quiz.id, userAnswers);
  }

  private static async finalizeDailyQuiz(
    userId: string,
    dailyQuizId: string,
    userAnswers: Array<{ questionId: string; answer: string; attemptCount: number }>,
  ) {
    const quiz = await prisma.dailyQuiz.findUnique({
      where: { id: dailyQuizId },
      include: { questions: true },
    });

    if (!quiz) throw new Error('Quiz not found or has expired.');

    if (userAnswers.length !== quiz.questions.length) {
      throw new Error(`You must solve all ${quiz.questions.length} questions.`);
    }

    const validQuestionIds = new Set(quiz.questions.map((question) => question.id));
    for (const submission of userAnswers) {
      if (!validQuestionIds.has(submission.questionId)) {
        throw new Error(`Invalid Question ID detected: ${submission.questionId}`);
      }
    }

    const totalQuestions = quiz.questions.length;
    const answerKey = new Map(quiz.questions.map((question) => [question.id, question.correctAnswer]));
    const submittedAnswerMap = new Map(userAnswers.map((submission) => [submission.questionId, submission]));
    const baseSatsPerQuestion = totalQuestions > 0 ? quiz.rewardSats / totalQuestions : 0;
    const baseXpPerQuestion = totalQuestions > 0 ? quiz.xpReward / totalQuestions : 0;
    let totalAttempts = 0;
    let computedRewardSats = 0;
    let computedRewardXp = 0;

    for (const submission of userAnswers) {
      const correctAnswer = answerKey.get(submission.questionId);
      if (!correctAnswer || correctAnswer !== submission.answer) {
        throw new Error('Submit only after solving every question correctly.');
      }

      const attemptCount = Math.max(1, submission.attemptCount || 1);
      totalAttempts += attemptCount;

      const multiplier = getQuizAttemptMultiplier(attemptCount);
      computedRewardSats += Math.floor(baseSatsPerQuestion * multiplier);
      computedRewardXp += Math.floor(baseXpPerQuestion * multiplier);
    }

    const score = totalQuestions;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        currentStreak: true,
        lastActivityAt: true,
        lastClaimedStreakMilestone: true,
        premiumTier: true,
        premiumExpiresAt: true,
      },
    });
    if (!user) throw new Error('User not found.');

    const passed = score === totalQuestions;
    const finalRewardSats = computedRewardSats;
    const finalRewardXp = computedRewardXp;
    const streakEvaluation = evaluateDailyActivityStreak(user.lastActivityAt, user.currentStreak);
    const nextMilestone = getNextStreakMilestone(user.lastClaimedStreakMilestone);
    const hasPremium = !!(user as any).premiumTier && !!(user as any).premiumExpiresAt && new Date((user as any).premiumExpiresAt) > new Date();
    const streakMilestoneEligible = !!(
      nextMilestone
      && streakEvaluation.nextStreak >= nextMilestone
      && (!isPremiumStreakMilestone(nextMilestone) || hasPremium)
    );
    const streakBonusSats = streakMilestoneEligible && nextMilestone
      ? getStreakMilestoneReward(nextMilestone)
      : 0;

    const existingAttempt = await prisma.quizAttempt.findUnique({
      where: { userId_dailyQuizId: { userId, dailyQuizId: quiz.id } },
    });

    return await prisma.$transaction(async (tx) => {
      const attempt = existingAttempt
        ? await tx.quizAttempt.update({
            where: { id: existingAttempt.id },
            data: {
              answers: userAnswers,
              score,
              passed,
            },
          })
        : await tx.quizAttempt.create({
            data: {
              userId,
              dailyQuizId: quiz.id,
              answers: userAnswers,
              score,
              passed,
            },
          });

      const review = quiz.questions
        .sort((a, b) => a.order - b.order)
        .map((question) => {
          const submittedAnswer = submittedAnswerMap.get(question.id);
          const selectedAnswer = submittedAnswer?.answer || '';
          const correctAnswer = question.correctAnswer;
          const attemptCount = Math.max(1, submittedAnswer?.attemptCount || 1);
          const multiplier = getQuizAttemptMultiplier(attemptCount);
          const rewardAwarded = selectedAnswer === correctAnswer ? Math.floor(baseSatsPerQuestion * multiplier) : 0;
          const xpAwarded = selectedAnswer === correctAnswer ? Math.floor(baseXpPerQuestion * multiplier) : 0;

          return {
            questionId: question.id,
            questionText: question.questionText,
            explanation: question.explanation,
            selectedAnswer,
            correctAnswer,
            isCorrect: selectedAnswer === correctAnswer,
            attemptCount,
            rewardAwarded,
            xpAwarded,
            options: question.options,
            order: question.order,
            wrongAnswers: [],
          };
        });

      if (finalRewardSats <= 0 && finalRewardXp <= 0 && streakBonusSats <= 0) {
        await tx.user.update({
          where: { id: userId },
          data: {
            currentStreak: streakEvaluation.nextStreak,
            lastActivityAt: new Date(),
          },
        });

        return {
          message: `Oof! You scored ${score}/${totalQuestions} and earned 0 Sats. Your daily streak activity was still counted.`,
          passed: false,
          score,
          totalQuestions,
          maxRewardSats: quiz.rewardSats,
          maxXpReward: quiz.xpReward,
          totalAttempts,
          quizTitle: quiz.title,
          quizDescription: 'Keep guessing until you get each answer right. More wrong tries reduce that question\'s reward.',
          rewardEarned: 0,
          xpEarned: 0,
          streakBonusSats: 0,
          submittedAt: attempt.createdAt,
          review,
        };
      }

      await tx.user.update({
        where: { id: userId },
        data: {
          balanceAvailable: { increment: finalRewardSats + streakBonusSats },
          totalXp: { increment: finalRewardXp },
          currentStreak: streakEvaluation.nextStreak,
          lastActivityAt: new Date(),
          ...(streakBonusSats > 0 && nextMilestone
            ? { lastClaimedStreakMilestone: nextMilestone }
            : {}),
        },
      });

      if (finalRewardSats > 0) {
        await tx.ledger.create({
          data: {
            userId,
            amountSats: finalRewardSats,
            type: 'DAILY_QUIZ_REWARD',
            description: `Daily Quiz: ${quiz.title} (${score}/${totalQuestions} correct)`,
            referenceId: attempt.id,
          },
        });
      }

      if (streakBonusSats > 0 && nextMilestone) {
        await tx.ledger.create({
          data: {
            userId,
            amountSats: streakBonusSats,
            type: 'STREAK_BONUS',
            description: `Streak milestone reached: ${nextMilestone} days`,
            referenceId: attempt.id,
          },
        });

        await NotificationService.notifyUser(
          userId,
          'Streak Milestone Reward Unlocked',
          `You reached your ${nextMilestone}-day streak and earned ${streakBonusSats} sats.`,
          'SYSTEM_ALERT',
          attempt.id,
        );
      }

      return {
        message: `Quiz completed! You earned ${finalRewardSats} sats after ${totalAttempts} total tries across ${totalQuestions} questions.`,
        passed,
        score,
        totalQuestions,
        maxRewardSats: quiz.rewardSats,
        maxXpReward: quiz.xpReward,
        totalAttempts,
        quizTitle: quiz.title,
        quizDescription: 'Keep guessing until you get each answer right. More wrong tries reduce that question\'s reward.',
        rewardEarned: finalRewardSats,
        xpEarned: finalRewardXp,
        streakBonusSats,
        submittedAt: attempt.createdAt,
        review,
      };
    });
  }
}

