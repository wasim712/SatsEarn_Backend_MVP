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
  static async getTasks(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { totalXp: true, premiumTier: true, premiumExpiresAt: true },
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

    return tasks.map((task) => ({
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
      select: { totalXp: true, premiumTier: true, premiumExpiresAt: true },
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
