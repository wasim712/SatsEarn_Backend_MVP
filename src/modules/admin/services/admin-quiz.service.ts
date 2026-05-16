import { prisma } from '../../../db/prisma.client';

function normalizeQuizDateInput(dateInput: string) {
  const [year, month, day] = dateInput.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) {
    throw new Error('Invalid quiz date format.');
  }
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

export class AdminQuizService {
  static async createDailyQuiz(data: {
    date: string;
    title: string;
    rewardSats: number;
    xpReward: number;
    questions: Array<{
      questionText: string;
      explanation?: string;
      options: string[];
      correctAnswer: string;
      order: number;
    }>;
  }) {
    const targetDate = normalizeQuizDateInput(data.date);
    const existingQuiz = await prisma.dailyQuiz.findUnique({ where: { date: targetDate } });

    if (existingQuiz) {
      throw new Error(`A quiz already exists for ${data.date}.`);
    }

    return await prisma.dailyQuiz.create({
      data: {
        date: targetDate,
        title: data.title,
        rewardSats: data.rewardSats,
        xpReward: data.xpReward || 0,
        questions: {
          create: data.questions.map((question) => ({
            questionText: question.questionText,
            explanation: question.explanation?.trim() || null,
            options: question.options,
            correctAnswer: question.correctAnswer,
            order: question.order,
          })),
        },
      },
      include: {
        questions: true,
      },
    });
  }

  static async getAllDailyQuizzes() {
    return await prisma.dailyQuiz.findMany({
      orderBy: { date: 'desc' },
      include: {
        _count: {
          select: { questions: true, attempts: true },
        },
      },
    });
  }

  static async getDailyQuizById(id: string) {
    const quiz = await prisma.dailyQuiz.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    if (!quiz) throw new Error('Quiz not found');
    return quiz;
  }

  static async updateDailyQuiz(
    id: string,
    data: { title?: string; rewardSats?: number; xpReward?: number; isActive?: boolean },
  ) {
    await this.getDailyQuizById(id);
    return await prisma.dailyQuiz.update({ where: { id }, data });
  }

  static async deleteDailyQuiz(id: string) {
    return await prisma.$transaction(async (tx) => {
      await tx.quizAttempt.deleteMany({ where: { dailyQuizId: id } });
      await tx.dailyQuiz.delete({ where: { id } });
      return { message: 'Quiz and all associated data permanently deleted.' };
    });
  }
}
