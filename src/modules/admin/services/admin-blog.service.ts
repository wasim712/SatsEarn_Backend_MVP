import { prisma } from '../../../db/prisma.client';

export class AdminBlogService {
  static async createBlogPost(data: {
    title: string;
    slug: string;
    excerpt?: string;
    content: string;
    coverImageUrl?: string;
    isPublished?: boolean;
  }) {
    return prisma.blogPost.create({
      data: {
        title: data.title,
        slug: data.slug,
        excerpt: data.excerpt || null,
        content: data.content,
        coverImageUrl: data.coverImageUrl || null,
        isPublished: Boolean(data.isPublished),
        publishedAt: data.isPublished ? new Date() : null,
      },
    });
  }

  static async getAllBlogPosts() {
    return prisma.blogPost.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  static async updateBlogPost(id: string, data: {
    title?: string;
    slug?: string;
    excerpt?: string;
    content?: string;
    coverImageUrl?: string | null;
    isPublished?: boolean;
  }) {
    const current = await prisma.blogPost.findUnique({ where: { id } });
    if (!current) throw new Error('Blog post not found.');

    const nextPublished = typeof data.isPublished === 'boolean' ? data.isPublished : current.isPublished;

    return prisma.blogPost.update({
      where: { id },
      data: {
        ...data,
        excerpt: data.excerpt !== undefined ? data.excerpt || null : undefined,
        coverImageUrl: data.coverImageUrl !== undefined ? data.coverImageUrl || null : undefined,
        publishedAt: nextPublished ? current.publishedAt || new Date() : null,
      },
    });
  }

  static async deleteBlogPost(id: string) {
    await prisma.blogPost.delete({ where: { id } });
    return { success: true };
  }
}
