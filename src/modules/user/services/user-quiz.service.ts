import { prisma } from '../../../db/prisma.client';
import {
  evaluateDailyActivityStreak,
  getNextStreakMilestone,
  getStreakMilestoneReward,
  isPremiumStreakMilestone,
} from '../../../utils/reward.util';
import { NotificationService } from '../../notifications/notification.service';

function getQuizAttemptMultiplier(attemptCount: number) {
  if (attemptCount <= 1) return 0.7;
  if (attemptCount === 2) return 0.5;
  if (attemptCount === 3) return 0.25;
  if (attemptCount === 4) return 0.2;
  return 0.1;
}

export class UserQuizService {
  static async submitQuizTask(userId: string, taskId: string, answers: string[]) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { campaign: true },
    });

    if (!task) throw new Error('Task not found');

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
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

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

    const safeQuestions = quiz.questions.map((question) => ({
      id: question.id,
      questionText: question.questionText,
      explanation: question.explanation,
      options: question.options,
      order: question.order,
      correctAnswer: question.correctAnswer,
    }));

    const existingAttempt = await prisma.quizAttempt.findUnique({
      where: { userId_dailyQuizId: { userId, dailyQuizId: quiz.id } },
    });

    const quizPayload = {
      id: quiz.id,
      title: quiz.title,
      description: 'Keep guessing until you get each answer right. More wrong tries reduce that question\'s reward.',
      rewardSats: quiz.rewardSats,
      xpReward: quiz.xpReward,
      questions: safeQuestions,
    };

    if (existingAttempt) {
      const totalQuestions = quiz.questions.length;
      const savedAnswers = Array.isArray(existingAttempt.answers)
        ? existingAttempt.answers as Array<{ questionId: string; answer: string; attemptCount?: number }>
        : [];
      const savedAnswerMap = new Map(savedAnswers.map((item) => [item.questionId, item]));
      const baseSatsPerQuestion = totalQuestions > 0 ? quiz.rewardSats / totalQuestions : 0;
      const baseXpPerQuestion = totalQuestions > 0 ? quiz.xpReward / totalQuestions : 0;

      let computedRewardSats = 0;
      let computedRewardXp = 0;
      let totalAttempts = 0;

      const review = quiz.questions
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((question) => {
          const savedAnswer = savedAnswerMap.get(question.id);
          const selectedAnswer = savedAnswer?.answer || '';
          const correctAnswer = question.correctAnswer;
          const attemptCount = Math.max(1, savedAnswer?.attemptCount || 1);
          totalAttempts += attemptCount;

          const isCorrect = selectedAnswer === correctAnswer;
          const multiplier = getQuizAttemptMultiplier(attemptCount);
          const rewardAwarded = isCorrect ? Math.floor(baseSatsPerQuestion * multiplier) : 0;
          const xpAwarded = isCorrect ? Math.floor(baseXpPerQuestion * multiplier) : 0;

          computedRewardSats += rewardAwarded;
          computedRewardXp += xpAwarded;

          return {
            questionId: question.id,
            questionText: question.questionText,
            explanation: question.explanation,
            selectedAnswer,
            correctAnswer,
            isCorrect,
            attemptCount,
            rewardAwarded,
            xpAwarded,
            options: question.options,
            order: question.order,
          };
        });

      const fallbackRewardSats = totalQuestions > 0 ? Math.floor((quiz.rewardSats / totalQuestions) * existingAttempt.score) : 0;
      const fallbackRewardXp = totalQuestions > 0 ? Math.floor((quiz.xpReward / totalQuestions) * existingAttempt.score) : 0;
      const rewardEarned = savedAnswers.length > 0 ? computedRewardSats : fallbackRewardSats;
      const xpEarned = savedAnswers.length > 0 ? computedRewardXp : fallbackRewardXp;

      return {
        status: 'submitted' as const,
        quiz: quizPayload,
        result: {
          message: existingAttempt.passed
            ? `Quiz completed! You earned ${rewardEarned} sats based on your answer attempts.`
            : `Quiz submitted. You earned ${rewardEarned} sats based on your answer attempts.`,
          passed: existingAttempt.passed,
          score: existingAttempt.score,
          rewardEarned,
          xpEarned,
          streakBonusSats: 0,
          totalQuestions,
          maxRewardSats: quiz.rewardSats,
          maxXpReward: quiz.xpReward,
          totalAttempts,
          quizTitle: quiz.title,
          quizDescription: quizPayload.description,
          submittedAt: existingAttempt.createdAt,
          review,
        },
      };
    }

    return {
      status: 'available' as const,
      quiz: quizPayload,
    };
  }

  static async submitDailyQuiz(
    userId: string,
    userAnswers: Array<{ questionId: string; answer: string; attemptCount: number }>,
  ) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

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

    const existingAttempt = await prisma.quizAttempt.findUnique({
      where: { userId_dailyQuizId: { userId, dailyQuizId: quiz.id } },
    });

    if (existingAttempt) {
      throw new Error("You have already submitted answers for today's quiz.");
    }

    if (userAnswers.length !== quiz.questions.length) {
      throw new Error(`You must submit exactly ${quiz.questions.length} answers.`);
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

    return await prisma.$transaction(async (tx) => {
      const attempt = await tx.quizAttempt.create({
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
