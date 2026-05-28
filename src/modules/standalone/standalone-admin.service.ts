import { prisma } from '../../db/prisma.client';
import {
  normalizeStandaloneRequiredPlatform,
  sanitizeStandaloneTierRewardMatrix,
} from './standalone.helpers';

export class StandaloneAdminService {
  static async createTask(data: any) {
    const isPremiumOnly = Boolean(data.isPremiumOnly);

    const task = await prisma.standaloneTask.create({
      data: {
        title: data.title,
        description: data.description,
        category: data.category || 'SOCIAL',
        coverImageUrl: data.coverImageUrl || null,
        targetUrl: data.targetUrl || null,
        targetCountries: Array.isArray(data.targetCountries) ? data.targetCountries : [],
        isPremiumOnly,
        requiredFreeTier: isPremiumOnly ? 'BASIC' : (data.requiredFreeTier || 'BASIC'),
        proofType: data.proofType || 'SCREENSHOT',
        requiredPlatform: normalizeStandaloneRequiredPlatform(data.requiredPlatform),
        xpReward: Number(data.xpReward ?? data.xpRewardOverride ?? 0),
        tierRewardMatrix: sanitizeStandaloneTierRewardMatrix(
          data.tierRewardMatrix ?? data.tierRewardMatrixOverride,
          isPremiumOnly,
        ),
        doubleRewardsStartAt: data.doubleRewardsStartAt || null,
        doubleRewardsEndAt: data.doubleRewardsEndAt || null,
      },
    });

    return { task };
  }

  static async getAllTasks() {
    return prisma.standaloneTask.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  static async getTaskById(taskId: string) {
    const task = await prisma.standaloneTask.findUnique({ where: { id: taskId } });
    if (!task) throw new Error('Standalone task not found');
    return task;
  }

  static async updateTask(taskId: string, data: any) {
    const existingTask = await this.getTaskById(taskId);
    const isPremiumOnly = data.isPremiumOnly !== undefined ? Boolean(data.isPremiumOnly) : existingTask.isPremiumOnly;

    return prisma.standaloneTask.update({
      where: { id: taskId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'coverImageUrl') ? { coverImageUrl: data.coverImageUrl || null } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'targetUrl') ? { targetUrl: data.targetUrl || null } : {}),
        ...(data.targetCountries !== undefined ? { targetCountries: Array.isArray(data.targetCountries) ? data.targetCountries : [] } : {}),
        ...(data.isPremiumOnly !== undefined ? { isPremiumOnly } : {}),
        ...((data.requiredFreeTier !== undefined || data.isPremiumOnly !== undefined)
          ? { requiredFreeTier: isPremiumOnly ? 'BASIC' : (data.requiredFreeTier || existingTask.requiredFreeTier) }
          : {}),
        ...(data.proofType !== undefined ? { proofType: data.proofType } : {}),
        ...(data.requiredPlatform !== undefined ? { requiredPlatform: normalizeStandaloneRequiredPlatform(data.requiredPlatform) } : {}),
        ...(data.xpReward !== undefined || data.xpRewardOverride !== undefined
          ? { xpReward: Number(data.xpReward ?? data.xpRewardOverride ?? 0) }
          : {}),
        ...(data.tierRewardMatrix !== undefined || data.tierRewardMatrixOverride !== undefined || data.isPremiumOnly !== undefined
          ? {
              tierRewardMatrix: sanitizeStandaloneTierRewardMatrix(
                data.tierRewardMatrix ?? data.tierRewardMatrixOverride ?? existingTask.tierRewardMatrix,
                isPremiumOnly,
              ),
            }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'doubleRewardsStartAt') ? { doubleRewardsStartAt: data.doubleRewardsStartAt || null } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'doubleRewardsEndAt') ? { doubleRewardsEndAt: data.doubleRewardsEndAt || null } : {}),
        ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
      },
    });
  }

  static async deleteTask(taskId: string) {
    await this.getTaskById(taskId);
    await prisma.standaloneTask.update({ where: { id: taskId }, data: { isActive: false } });
  }
}
