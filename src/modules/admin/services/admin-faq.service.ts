import { prisma } from '../../../db/prisma.client';

export class AdminFaqService {
  static async createFaqItem(data: {
    question: string;
    answer: string;
    category?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return prisma.faqItem.create({
      data: {
        question: data.question,
        answer: data.answer,
        category: data.category || null,
        sortOrder: data.sortOrder || 0,
        isActive: data.isActive ?? true,
      },
    });
  }

  static async getAllFaqItems() {
    return prisma.faqItem.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  static async updateFaqItem(id: string, data: {
    question?: string;
    answer?: string;
    category?: string;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    return prisma.faqItem.update({
      where: { id },
      data: {
        ...data,
        category: data.category !== undefined ? data.category || null : undefined,
      },
    });
  }

  static async deleteFaqItem(id: string) {
    await prisma.faqItem.delete({ where: { id } });
    return { success: true };
  }
}
