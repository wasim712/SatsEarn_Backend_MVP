import { SubmissionStatus } from '@prisma/client';
import { prisma } from '../../db/prisma.client';
import { TierUtils } from '../../utils/tier.utils';
import { AiVerificationService } from '../verification/verification.service';
import {
  applyStandaloneRewardEffects,
  getStandaloneDisplayReward,
  getStandaloneRewardForUser,
  getStandaloneUnlockAt,
} from './standalone.helpers';

export class StandaloneUserService {
  private static isWithinNewUserWindow(createdAt: Date, maxAgeDays: number | null | undefined) {
    if (!maxAgeDays || maxAgeDays <= 0) return false;
    const accountAgeMs = Date.now() - new Date(createdAt).getTime();
    const accountAgeDays = Math.floor(accountAgeMs / (24 * 60 * 60 * 1000));
    return accountAgeDays <= maxAgeDays;
  }

  static async getTasks(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true, premiumTier: true, premiumExpiresAt: true, country: true, createdAt: true },
    });
    if (!user) throw new Error('User not found');

    const tasks = await prisma.standaloneTask.findMany({
      where: { isActive: true },
      include: {
        submissions: {
          where: { userId },
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const freeTierOrder = ['BASIC', 'COPPER', 'BRONZE', 'SILVER', 'GOLD'];
    const userFreeTier = TierUtils.getFreeTier(user.totalXp);
    const userFreeTierIndex = freeTierOrder.indexOf(userFreeTier);
    const hasPremium = TierUtils.isPremiumActive(user as any);

    return tasks
      .filter((task) => {
        if (task.targetCountries.length > 0 && !task.targetCountries.includes(user.country || 'IN')) return false;
        if (task.isNewUserOnly && !this.isWithinNewUserWindow(user.createdAt, task.newUserMaxAccountAgeDays)) return false;
        if (task.isPremiumOnly) return hasPremium;
        const requiredTierIndex = freeTierOrder.indexOf(task.requiredFreeTier);
        return requiredTierIndex <= userFreeTierIndex || hasPremium;
      })
      .map((task) => ({
        ...task,
        taskRewardSats: getStandaloneDisplayReward(task, user),
        userSubmission: task.submissions[0] || null,
        hasStarted: task.submissions.length > 0,
        isCompleted: ['PENDING_24H', 'LOCKED_15D', 'WITHDRAWABLE', 'MANUAL_REVIEW'].includes(task.submissions[0]?.status || ''),
        doubleRewardsActive: false,
      }));
  }

  static async getTaskDetails(userId: string, taskId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true, premiumTier: true, premiumExpiresAt: true, country: true, createdAt: true },
    });
    if (!user) throw new Error('User not found');

    const task = await prisma.standaloneTask.findUnique({
      where: { id: taskId },
      include: {
        submissions: {
          where: { userId },
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!task || !task.isActive) throw new Error('Standalone task not found');

    const freeTierOrder = ['BASIC', 'COPPER', 'BRONZE', 'SILVER', 'GOLD'];
    const userFreeTier = TierUtils.getFreeTier(user.totalXp);
    const userFreeTierIndex = freeTierOrder.indexOf(userFreeTier);
    const hasPremium = TierUtils.isPremiumActive(user as any);
    const requiredTierIndex = freeTierOrder.indexOf(task.requiredFreeTier);

    if (task.targetCountries.length > 0 && !task.targetCountries.includes(user.country || 'IN')) throw new Error('Standalone task not available in your region');
    if (task.isNewUserOnly && !this.isWithinNewUserWindow(user.createdAt, task.newUserMaxAccountAgeDays)) throw new Error('This standalone task is only available to new users');
    if (task.isPremiumOnly && !hasPremium) throw new Error('This standalone task requires premium access');
    if (!(requiredTierIndex <= userFreeTierIndex || hasPremium)) throw new Error('You do not meet the tier requirement for this standalone task');

    return {
      ...task,
      taskRewardSats: getStandaloneDisplayReward(task, user),
      userSubmission: task.submissions[0] || null,
      doubleRewardsActive: false,
    };
  }

  static async getTaskStatus(userId: string, taskId: string) {
    const submission = await prisma.standaloneSubmission.findUnique({
      where: { userId_standaloneTaskId: { userId, standaloneTaskId: taskId } },
      select: { status: true, submittedAt: true, rejectionReason: true, unlockAt: true },
    });

    if (!submission) {
      return { status: null, submittedAt: null, rejectionReason: null, unlockAt: null };
    }

    return submission;
  }

  static async submitTask(userId: string, taskId: string, proofData: { screenshotUrl?: string; proofText?: string }, clientIp = 'UNKNOWN') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        referredById: true,
        fullName: true,
        totalXp: true,
        createdAt: true,
        currentStreak: true,
        lastActivityAt: true,
        lastClaimedStreakMilestone: true,
        premiumTier: true,
        premiumExpiresAt: true,
      },
    });
    if (!user) throw new Error('User not found.');

    const task = await prisma.standaloneTask.findUnique({ where: { id: taskId } });
    if (!task || !task.isActive) throw new Error('Standalone task not found.');
    if (task.isNewUserOnly && !this.isWithinNewUserWindow(user.createdAt, task.newUserMaxAccountAgeDays)) throw new Error('This standalone task is only available to new users.');

    const existing = await prisma.standaloneSubmission.findUnique({
      where: { userId_standaloneTaskId: { userId, standaloneTaskId: taskId } },
    });
    if (existing && existing.status !== SubmissionStatus.REJECTED) {
      throw new Error('You have already submitted this standalone task.');
    }

    const aiResult = proofData.screenshotUrl
      ? await AiVerificationService.analyzeProof(proofData.screenshotUrl, {
          title: task.title,
          description: task.description,
          proofType: task.proofType,
          targetUrl: task.targetUrl,
        })
      : { score: 75, reason: 'Non-image proof submitted. Flagged for manual review.' };

    let determinedStatus: SubmissionStatus = SubmissionStatus.PENDING_24H;
    if (aiResult.score >= 90) determinedStatus = SubmissionStatus.PENDING_24H;
    else if (aiResult.score >= 70) determinedStatus = SubmissionStatus.MANUAL_REVIEW;
    else determinedStatus = SubmissionStatus.REJECTED;

    const workerReward = getStandaloneRewardForUser(task.tierRewardMatrix, user);
    const xpReward = Number(task.xpReward || 0);

    const submission = existing && existing.status === SubmissionStatus.REJECTED
      ? await prisma.standaloneSubmission.update({
          where: { id: existing.id },
          data: {
            ipAddress: clientIp,
            screenshotUrl: proofData.screenshotUrl || null,
            proofText: proofData.proofText || null,
            confidenceScore: aiResult.score,
            status: determinedStatus,
            rejectionReason: determinedStatus === SubmissionStatus.REJECTED ? aiResult.reason : null,
            unlockAt: getStandaloneUnlockAt(determinedStatus),
            submittedAt: new Date(),
          },
        })
      : await prisma.standaloneSubmission.create({
          data: {
            userId,
            standaloneTaskId: taskId,
            ipAddress: clientIp,
            screenshotUrl: proofData.screenshotUrl || null,
            proofText: proofData.proofText || null,
            confidenceScore: aiResult.score,
            status: determinedStatus,
            rejectionReason: determinedStatus === SubmissionStatus.REJECTED ? aiResult.reason : null,
            unlockAt: getStandaloneUnlockAt(determinedStatus),
          },
        });

    await applyStandaloneRewardEffects({
      userId,
      userFullName: user.fullName,
      referredById: user.referredById,
      workerReward,
      xpReward,
      standaloneTaskTitle: task.title,
      submissionId: submission.id,
      submissionStatus: determinedStatus,
      rejectionReason: submission.rejectionReason,
    });

    return submission;
  }
}
