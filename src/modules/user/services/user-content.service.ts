import { prisma } from '../../../db/prisma.client';
import { sanitizeBlogPost } from '../../../utils/html-sanitize.util';

export class UserContentService {
  // Content is sanitized on read as well as on save, so posts written before sanitizing existed are safe.
  static async getPublishedBlogs() {
    const posts = await prisma.blogPost.findMany({
      where: { isPublished: true },
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return posts.map(sanitizeBlogPost);
  }

  static async getPublishedBlogById(id: string) {
    return sanitizeBlogPost(await prisma.blogPost.findFirst({
      where: {
        id,
        isPublished: true,
      },
    }));
  }

  static async getPublishedBlogBySlug(slug: string) {
    return sanitizeBlogPost(await prisma.blogPost.findFirst({
      where: {
        slug,
        isPublished: true,
      },
    }));
  }

  static async getActiveFaqs() {
    return prisma.faqItem.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }
}
