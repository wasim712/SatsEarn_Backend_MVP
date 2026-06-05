import { prisma } from '../../../db/prisma.client';
import {
  evaluateDailyActivityStreak,
  getNextStreakMilestone,
  getStreakMilestoneReward,
  isPremiumStreakMilestone,
} from '../../../utils/reward.util';
import { TierUtils } from '../../../utils/tier.utils';
import { NotificationService } from '../../notifications/notification.service';
import { DEFAULT_SECURITY_LOCK_DAYS, getSecurityUnlockAt } from '../../../utils/submission-flow.util';

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
  if (attemptCount <= 1) return 1;
  if (attemptCount === 2) return 0.7;
  if (attemptCount === 3) return 0.5;
  if (attemptCount === 4) return 0.25;
  if (attemptCount === 5) return 0.2;
  return 0.1;
}

function allocateProportionalIntegers(total: number, weights: number[]) {
  if (total <= 0 || weights.length === 0) {
    return weights.map(() => 0);
  }

  const safeWeights = weights.map((weight) => (Number.isFinite(weight) && weight > 0 ? weight : 0));
  const weightSum = safeWeights.reduce((sum, weight) => sum + weight, 0);

  if (weightSum <= 0) {
    return safeWeights.map(() => 0);
  }

  const rawAllocations = safeWeights.map((weight) => (total * weight) / weightSum);
  const floored = rawAllocations.map((value) => Math.floor(value));
  let remainder = total - floored.reduce((sum, value) => sum + value, 0);

  const ranked = rawAllocations
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);

  for (const item of ranked) {
    if (remainder <= 0) break;
    if (safeWeights[item.index] <= 0) continue;
    floored[item.index] += 1;
    remainder -= 1;
  }

  return floored;
}

function normalizeQuizDateKey(dateKey?: string) {
  const normalized = (dateKey || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  return new Date().toISOString().slice(0, 10);
}

async function findQuizByDate(dateKey?: string) {
  const quizDateKey = normalizeQuizDateKey(dateKey);

  const quizzes = await prisma.dailyQuiz.findMany({
    where: {
      isActive: true,
    },
    include: { questions: { orderBy: { order: 'asc' } } },
  });

  return quizzes.find((quiz) => quiz.date.toISOString().slice(0, 10) === quizDateKey) || null;
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
  quiz: { id: string; title: string; rewardSats: number; xpReward: number; date: Date; questions: QuizQuestionEntity[] },
) {
  return {
    id: quiz.id,
    date: quiz.date.toISOString().slice(0, 10),
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
    })),
  };
}

function buildInProgressResult(
  quiz: { title: string; rewardSats: number; xpReward: number; questions: QuizQuestionEntity[] },
  persistedAnswers: PersistedQuizAnswer[],
) {
  const totalQuestions = quiz.questions.length;
  const sortedQuestions = quiz.questions.slice().sort((a, b) => a.order - b.order);
  const answerMap = new Map(persistedAnswers.map((item) => [item.questionId, item]));

  let rewardEarned = 0;
  let xpEarned = 0;
  let totalAttempts = 0;
  let solvedCount = 0;

  const questionStates = sortedQuestions.map((question) => {
    const savedAnswer = answerMap.get(question.id);
    const selectedAnswer = savedAnswer?.answer || '';
    const wrongAnswers = savedAnswer?.wrongAnswers || [];
    const attemptCount = Math.max(savedAnswer?.attemptCount || wrongAnswers.length || 0, wrongAnswers.length);
    const isCorrect = selectedAnswer === question.correctAnswer;
    const multiplier = getQuizAttemptMultiplier(Math.max(1, attemptCount || 1));

    totalAttempts += attemptCount;
    if (isCorrect) {
      solvedCount += 1;
    }

    return { question, selectedAnswer, wrongAnswers, attemptCount: Math.max(1, attemptCount || 1), isCorrect, multiplier };
  });

  const rewardAllocations = allocateProportionalIntegers(
    quiz.rewardSats,
    questionStates.map((state) => (state.isCorrect ? state.multiplier : 0)),
  );
  const xpAllocations = allocateProportionalIntegers(
    quiz.xpReward,
    questionStates.map((state) => (state.isCorrect ? state.multiplier : 0)),
  );

  const review = questionStates.map((state, index) => {
      const questionReward = rewardAllocations[index] || 0;
      const questionXp = xpAllocations[index] || 0;

      if (state.isCorrect) {
        rewardEarned += questionReward;
        xpEarned += questionXp;
      }

      return {
        questionId: state.question.id,
        questionText: state.question.questionText,
        explanation: state.question.explanation,
        selectedAnswer: state.selectedAnswer,
        isCorrect: state.isCorrect,
        attemptCount: state.attemptCount,
        rewardAwarded: questionReward,
        xpAwarded: questionXp,
        options: state.question.options,
        order: state.question.order,
        wrongAnswers: state.wrongAnswers,
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

  static async getTodayQuiz(userId: string, dateKey?: string) {
    const quiz = await findQuizByDate(dateKey);

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

  static async submitDailyQuizAnswer(userId: string, questionId: string, answer: string, dateKey?: string) {
    const quiz = await findQuizByDate(dateKey);

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
    dateKey?: string,
  ) {
    const quiz = await findQuizByDate(dateKey);

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
    let totalAttempts = 0;

    for (const submission of userAnswers) {
      const correctAnswer = answerKey.get(submission.questionId);
      if (!correctAnswer || correctAnswer !== submission.answer) {
        throw new Error('Submit only after solving every question correctly.');
      }

      const attemptCount = Math.max(1, submission.attemptCount || 1);
      totalAttempts += attemptCount;
    }

    const sortedQuestions = quiz.questions.slice().sort((a, b) => a.order - b.order);
    const questionStates = sortedQuestions.map((question) => {
      const submission = submittedAnswerMap.get(question.id);
      const attemptCount = Math.max(1, submission?.attemptCount || 1);

      return {
        question,
        attemptCount,
        isCorrect: true,
        multiplier: getQuizAttemptMultiplier(attemptCount),
      };
    });

    const rewardAllocations = allocateProportionalIntegers(
      quiz.rewardSats,
      questionStates.map((state) => state.multiplier),
    );
    const xpAllocations = allocateProportionalIntegers(
      quiz.xpReward,
      questionStates.map((state) => state.multiplier),
    );

    const computedRewardSats = rewardAllocations.reduce((sum, value) => sum + value, 0);
    const computedRewardXp = xpAllocations.reduce((sum, value) => sum + value, 0);

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

    const settings = await prisma.platformSettings.findFirst();
    const securityLockDays = settings?.securityLockDays || DEFAULT_SECURITY_LOCK_DAYS;
    const quizUnlockAt = getSecurityUnlockAt(securityLockDays);

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

      const sortedQuestions = quiz.questions.slice().sort((a, b) => a.order - b.order);
      const questionStates = sortedQuestions.map((question) => {
        const submittedAnswer = submittedAnswerMap.get(question.id);
        const selectedAnswer = submittedAnswer?.answer || '';
        const correctAnswer = question.correctAnswer;
        const attemptCount = Math.max(1, submittedAnswer?.attemptCount || 1);
        const isCorrect = selectedAnswer === correctAnswer;
        const multiplier = getQuizAttemptMultiplier(attemptCount);

        return { question, selectedAnswer, correctAnswer, attemptCount, isCorrect, multiplier };
      });

      const rewardAllocations = allocateProportionalIntegers(
        quiz.rewardSats,
        questionStates.map((state) => (state.isCorrect ? state.multiplier : 0)),
      );
      const xpAllocations = allocateProportionalIntegers(
        quiz.xpReward,
        questionStates.map((state) => (state.isCorrect ? state.multiplier : 0)),
      );

      const review = questionStates.map((state, index) => {
          const rewardAwarded = rewardAllocations[index] || 0;
          const xpAwarded = xpAllocations[index] || 0;

          return {
            questionId: state.question.id,
            questionText: state.question.questionText,
            explanation: state.question.explanation,
            selectedAnswer: state.selectedAnswer,
            correctAnswer: state.correctAnswer,
            isCorrect: state.isCorrect,
            attemptCount: state.attemptCount,
            rewardAwarded,
            xpAwarded,
            options: state.question.options,
            order: state.question.order,
            wrongAnswers: [],
          };
        });

      if (finalRewardSats <= 0 && finalRewardXp <= 0 && streakBonusSats <= 0) {
        await tx.user.update({
          where: { id: userId },
          data: {
            currentStreak: streakEvaluation.nextStreak,
            lastActivityAt: new Date(),
            rewardSats: 0,
            streakBonusSats: 0,
            unlockAt: null,
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
          balanceLocked: { increment: finalRewardSats + streakBonusSats },
          totalXp: { increment: finalRewardXp },
          currentStreak: streakEvaluation.nextStreak,
          lastActivityAt: new Date(),
          ...(streakBonusSats > 0 && nextMilestone
            ? { lastClaimedStreakMilestone: nextMilestone }
            : {}),
        },
      });

      await tx.quizAttempt.update({
        where: { id: attempt.id },
        data: {
          rewardSats: finalRewardSats,
          streakBonusSats,
          unlockAt: finalRewardSats + streakBonusSats > 0 ? quizUnlockAt : null,
          rewardUnlockedAt: null,
        },
      });

      if (finalRewardSats > 0 || streakBonusSats > 0) {
        await NotificationService.notifyUser(
          userId,
          'Daily Quiz Reward Locked',
          `Your daily quiz reward of ${finalRewardSats + streakBonusSats} sats is now locked for ${securityLockDays} days before moving to available balance.`,
          'SYSTEM_ALERT',
          attempt.id,
        );
      }

      if (finalRewardSats > 0) {
        await tx.ledger.create({
          data: {
            userId,
            amountSats: finalRewardSats,
            type: 'DAILY_QUIZ_REWARD',
            description: `Daily Quiz: ${quiz.title} (${score}/${totalQuestions} correct) - locked for ${securityLockDays} days`,
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
            description: `Streak milestone reached: ${nextMilestone} days - locked for ${securityLockDays} days`,
            referenceId: attempt.id,
          },
        });

        await NotificationService.notifyUser(
          userId,
          'Streak Milestone Reward Unlocked',
          `You reached your ${nextMilestone}-day streak and earned ${streakBonusSats} sats. The reward is locked for ${securityLockDays} days.`,
          'SYSTEM_ALERT',
          attempt.id,
        );
      }

      return {
        message: `Quiz completed! You earned ${finalRewardSats} sats after ${totalAttempts} total tries across ${totalQuestions} questions. Your sats are now locked for ${securityLockDays} days before moving to available balance.`,
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

