import { prisma } from '../../../db/prisma.client';

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
      select: { id: true, currentStreak: true, lastActivityAt: true },
    });

    if (!user) throw new Error('User not found');

    if (user.currentStreak <= 0 || user.currentStreak % 7 !== 0) {
      throw new Error('No streak milestone available to claim right now.');
    }

    const bonusSats = Math.floor(user.currentStreak / 7) * 100;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { balanceAvailable: { increment: bonusSats } },
      });

      await tx.ledger.create({
        data: {
          userId,
          amountSats: bonusSats,
          type: 'STREAK_BONUS',
          description: `Claimed ${user.currentStreak}-day streak bonus`,
        },
      });
    });

    return { message: `Streak bonus claimed: ${bonusSats} Sats`, bonusSats };
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

  static async getTodayQuiz(_userId: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const quiz = await prisma.dailyQuiz.findFirst({
      where: { date: today, isActive: true },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!quiz) {
      throw new Error('There is no active quiz for today. Check back tomorrow!');
    }

    const safeQuestions = quiz.questions.map((question) => ({
      id: question.id,
      questionText: question.questionText,
      options: question.options,
      order: question.order,
    }));

    return {
      id: quiz.id,
      title: quiz.title,
      rewardSats: quiz.rewardSats,
      questions: safeQuestions,
    };
  }

  static async submitDailyQuiz(
    userId: string,
    userAnswers: Array<{ questionId: string; answer: string }>,
  ) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const quiz = await prisma.dailyQuiz.findFirst({
      where: { date: today, isActive: true },
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

    let score = 0;
    const totalQuestions = quiz.questions.length;
    const answerKey = new Map(quiz.questions.map((question) => [question.id, question.correctAnswer]));

    for (const submission of userAnswers) {
      const correctAnswer = answerKey.get(submission.questionId);
      if (correctAnswer && correctAnswer === submission.answer) {
        score++;
      }
    }

    const passed = score === totalQuestions;
    const exactEarnedSats = (quiz.rewardSats / totalQuestions) * score;
    const finalRewardSats = Math.floor(exactEarnedSats);

    return await prisma.$transaction(async (tx) => {
      const attempt = await tx.quizAttempt.create({
        data: {
          userId,
          dailyQuizId: quiz.id,
          score,
          passed,
        },
      });

      if (finalRewardSats <= 0) {
        return {
          message: `Oof! You scored ${score}/${totalQuestions} and earned 0 Sats. Study up for tomorrow!`,
          passed: false,
          score,
          rewardEarned: 0,
        };
      }

      await tx.user.update({
        where: { id: userId },
        data: { balanceAvailable: { increment: finalRewardSats } },
      });

      await tx.ledger.create({
        data: {
          userId,
          amountSats: finalRewardSats,
          type: 'DAILY_QUIZ_REWARD',
          description: `Daily Quiz: ${quiz.title} (${score}/${totalQuestions} correct)`,
          referenceId: attempt.id,
        },
      });

      return {
        message: passed
          ? `Perfect score! You earned the full ${finalRewardSats} Sats.`
          : `Good job! You got ${score}/${totalQuestions} correct and earned a partial reward of ${finalRewardSats} Sats.`,
        passed,
        score,
        rewardEarned: finalRewardSats,
      };
    });
  }
}
