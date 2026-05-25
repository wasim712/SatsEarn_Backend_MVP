import { prisma } from '../../db/prisma.client';
import { normalizeTierRewardMatrix } from './standalone.helpers';

export class StandaloneAdminService {
  static async createTask(data: any) {
    const task = await prisma.standaloneTask.create({
      data: {
        title: data.title,
        description: data.description,
        targetUrl: data.targetUrl || null,
        proofType: data.proofType || 'SCREENSHOT',
        requiredPlatform: data.requiredPlatform || 'NONE',
        xpReward: Number(data.xpReward ?? data.xpRewardOverride ?? 0),
        tierRewardMatrix: normalizeTierRewardMatrix(data.tierRewardMatrix ?? data.tierRewardMatrixOverride),
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
    if (!task || !task.isActive) throw new Error('Standalone task not found');
    return task;
  }

  static async updateTask(taskId: string, data: any) {
    await this.getTaskById(taskId);
    return prisma.standaloneTask.update({
      where: { id: taskId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'targetUrl') ? { targetUrl: data.targetUrl || null } : {}),
        ...(data.proofType !== undefined ? { proofType: data.proofType } : {}),
        ...(data.requiredPlatform !== undefined ? { requiredPlatform: data.requiredPlatform } : {}),
        ...(data.xpReward !== undefined || data.xpRewardOverride !== undefined
          ? { xpReward: Number(data.xpReward ?? data.xpRewardOverride ?? 0) }
          : {}),
        ...(data.tierRewardMatrix !== undefined || data.tierRewardMatrixOverride !== undefined
          ? { tierRewardMatrix: normalizeTierRewardMatrix(data.tierRewardMatrix ?? data.tierRewardMatrixOverride) }
          : {}),
        ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
      },
    });
  }

  static async deleteTask(taskId: string) {
    await this.getTaskById(taskId);
    await prisma.standaloneTask.update({ where: { id: taskId }, data: { isActive: false } });
  }
}
