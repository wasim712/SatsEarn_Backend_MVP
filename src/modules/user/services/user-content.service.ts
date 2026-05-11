import { prisma } from '../../../db/prisma.client';

export class UserContentService {
  static async getPublishedBlogs() {
    return prisma.blogPost.findMany({
      where: { isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  static async getActiveFaqs() {
    return prisma.faqItem.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }
}
