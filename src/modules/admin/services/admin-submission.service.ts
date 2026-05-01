import { prisma } from '../../../db/prisma.client';
import { NotificationService } from '../../notifications/notification.service';

export class AdminSubmissionService {
  static async getPendingSubmissions() {
    return await prisma.submission.findMany({
      where: { status: 'MANUAL_REVIEW' },
      include: {
        user: {
          select: {
            email: true,
            fullName: true,
          },
        },
        task: {
          include: {
            campaign: true,
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }

  static async reviewSubmission(
    submissionId: string,
    status: 'LOCKED_15D' | 'REJECTED',
    rejectionReason?: string,
    adminId?: string,
  ) {
    return await prisma.$transaction(
      async (tx) => {
        const submission = await tx.submission.findUnique({
          where: { id: submissionId },
          include: {
            user: true,
            task: { include: { campaign: true } },
          },
        });

        if (!submission) throw new Error('Submission not found');
        if (submission.status !== 'MANUAL_REVIEW') {
          throw new Error(`Submission already processed: ${submission.status}`);
        }

        if (status === 'LOCKED_15D') {
          await NotificationService.notifyUser(
            submission.userId,
            'Submission Approved',
            `Your submission for ${submission.task.title} passed manual review.`,
            'SUBMISSION_APPROVED',
            submission.id,
          );

          return await tx.submission.update({
            where: { id: submissionId },
            data: {
              status: 'LOCKED_15D',
              reviewedById: adminId,
              rejectionReason: null,
            },
          });
        }

        await NotificationService.notifyUser(
          submission.userId,
          'Submission Rejected',
          rejectionReason || 'Your submission did not meet task requirements.',
          'SUBMISSION_REJECTED',
          submission.id,
        );

        return await tx.submission.update({
          where: { id: submissionId },
          data: {
            status: 'REJECTED',
            rejectionReason,
            reviewedById: adminId,
          },
        });
      },
      { isolationLevel: 'Serializable' },
    );
  }
}
