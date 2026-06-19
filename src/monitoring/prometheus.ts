import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { prisma } from '../db/prisma.client';

const gaugeCacheTtlMs = 20_000;

export const metricsRegistry = new Registry();

collectDefaultMetrics({
  register: metricsRegistry,
  prefix: 'satsearn_node_',
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests handled by the backend.',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [metricsRegistry],
});

const taskSubmissionsTotal = new Counter({
  name: 'satsearn_task_submissions_total',
  help: 'Total task submissions recorded by result.',
  labelNames: ['result'] as const,
  registers: [metricsRegistry],
});

const standaloneSubmissionsTotal = new Counter({
  name: 'satsearn_standalone_submissions_total',
  help: 'Total standalone submissions recorded by result.',
  labelNames: ['result'] as const,
  registers: [metricsRegistry],
});

const quizSubmissionsTotal = new Counter({
  name: 'satsearn_quiz_submissions_total',
  help: 'Total daily quiz completions recorded by result.',
  labelNames: ['result'] as const,
  registers: [metricsRegistry],
});

const withdrawalRequestsTotal = new Counter({
  name: 'satsearn_withdrawal_requests_total',
  help: 'Total withdrawal requests created by result.',
  labelNames: ['result'] as const,
  registers: [metricsRegistry],
});

const referralCreditsTotal = new Counter({
  name: 'satsearn_referral_credits_total',
  help: 'Total referral credits created by source and result.',
  labelNames: ['source', 'result'] as const,
  registers: [metricsRegistry],
});

const cronRunsTotal = new Counter({
  name: 'satsearn_cron_runs_total',
  help: 'Total cron job runs by job and result.',
  labelNames: ['job', 'result'] as const,
  registers: [metricsRegistry],
});

const cronFailuresTotal = new Counter({
  name: 'satsearn_cron_failures_total',
  help: 'Total cron job failures by job.',
  labelNames: ['job'] as const,
  registers: [metricsRegistry],
});

const manualReviewQueue = new Gauge({
  name: 'satsearn_manual_review_queue',
  help: 'Current number of submissions awaiting manual review.',
  registers: [metricsRegistry],
});

const pendingWithdrawals = new Gauge({
  name: 'satsearn_pending_withdrawals',
  help: 'Current number of pending withdrawals.',
  registers: [metricsRegistry],
});

const negativeBalanceUsers = new Gauge({
  name: 'satsearn_negative_balance_users',
  help: 'Current number of users with a negative balance field.',
  registers: [metricsRegistry],
});

let lastGaugeRefreshAt = 0;
let gaugeRefreshPromise: Promise<void> | null = null;

function normalizeLabel(value: string) {
  return String(value || 'unknown').trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_') || 'unknown';
}

async function refreshGaugeMetrics() {
  const now = Date.now();
  if (now - lastGaugeRefreshAt < gaugeCacheTtlMs) return;
  if (gaugeRefreshPromise) return gaugeRefreshPromise;

  gaugeRefreshPromise = (async () => {
    const [campaignManualReviewCount, standaloneManualReviewCount, pendingWithdrawalCount, negativeBalanceCount] = await Promise.all([
      prisma.submission.count({ where: { status: 'MANUAL_REVIEW' } }),
      prisma.standaloneSubmission.count({ where: { status: 'MANUAL_REVIEW' } }),
      prisma.withdrawal.count({ where: { status: 'PENDING' } }),
      prisma.user.count({
        where: {
          OR: [
            { balancePending: { lt: 0 } },
            { balanceLocked: { lt: 0 } },
            { balanceAvailable: { lt: 0 } },
          ],
        },
      }),
    ]);

    manualReviewQueue.set(campaignManualReviewCount + standaloneManualReviewCount);
    pendingWithdrawals.set(pendingWithdrawalCount);
    negativeBalanceUsers.set(negativeBalanceCount);
    lastGaugeRefreshAt = Date.now();
  })()
    .catch((error) => {
      console.error('[METRICS] Failed to refresh gauge metrics:', error);
    })
    .finally(() => {
      gaugeRefreshPromise = null;
    });

  return gaugeRefreshPromise;
}

export async function getMetricsPayload() {
  await refreshGaugeMetrics();
  return metricsRegistry.metrics();
}

export function recordTaskSubmission(result: string) {
  taskSubmissionsTotal.inc({ result: normalizeLabel(result) });
}

export function recordStandaloneSubmission(result: string) {
  standaloneSubmissionsTotal.inc({ result: normalizeLabel(result) });
}

export function recordQuizSubmission(result: string) {
  quizSubmissionsTotal.inc({ result: normalizeLabel(result) });
}

export function recordWithdrawalRequest(result: string) {
  withdrawalRequestsTotal.inc({ result: normalizeLabel(result) });
}

export function recordReferralCredit(source: string, result: string) {
  referralCreditsTotal.inc({ source: normalizeLabel(source), result: normalizeLabel(result) });
}

export function recordCronRun(job: string, result: string) {
  cronRunsTotal.inc({ job: normalizeLabel(job), result: normalizeLabel(result) });
}

export function recordCronFailure(job: string) {
  cronFailuresTotal.inc({ job: normalizeLabel(job) });
}

