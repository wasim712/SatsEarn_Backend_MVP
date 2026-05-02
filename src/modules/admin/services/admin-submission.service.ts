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
    // ==========================================
    // 1. FAST PHASE: The Database Transaction
    // ==========================================
    const updatedSubmission = await prisma.$transaction(
      async (tx) => {
        const submission = await tx.submission.findUnique({
          where: { id: submissionId },
          include: { task: true }, // Include task so we can use the title later
        });

        if (!submission) throw new Error('Submission not found');
        if (submission.status !== 'MANUAL_REVIEW') {
          throw new Error(`Submission already processed: ${submission.status}`);
        }

        if (status === 'LOCKED_15D') {
          return await tx.submission.update({
            where: { id: submissionId },
            data: {
              status: 'LOCKED_15D',
              reviewedById: adminId,
              rejectionReason: null,
            },
            include: { task: true } // Return task for the notification
          });
        }

        // Otherwise, it's REJECTED
        return await tx.submission.update({
          where: { id: submissionId },
          data: {
            status: 'REJECTED',
            rejectionReason,
            reviewedById: adminId,
          },
          include: { task: true } // Return task for the notification
        });
      },
      { isolationLevel: 'Serializable' }
    );

    // ==========================================
    // 2. SLOW PHASE: Side Effects (Outside the Tx)
    // ==========================================
    // We wrap this in a try/catch so if the notification system crashes, 
    // it doesn't break the successful review that just happened in the DB.
    try {
      if (status === 'LOCKED_15D') {
        await NotificationService.notifyUser(
          updatedSubmission.userId,
          'Submission Approved',
          `Your submission for ${updatedSubmission.task.title} passed manual review.`,
          'SUBMISSION_APPROVED',
          updatedSubmission.id,
        );
      } else {
        await NotificationService.notifyUser(
          updatedSubmission.userId,
          'Submission Rejected',
          rejectionReason || 'Your submission did not meet task requirements.',
          'SUBMISSION_REJECTED',
          updatedSubmission.id,
        );
      }
    } catch (notifyError) {
      console.error("Review succeeded, but failed to send notification:", notifyError);
    }

    return updatedSubmission;
  }
}
