import type { NextFunction, Request, Response } from 'express';
import { httpRequestDurationSeconds, httpRequestsTotal } from './prometheus';

function normalizeRoute(req: Request) {
  if (req.route?.path) {
    const basePath = req.baseUrl || '';
    const routePath = typeof req.route.path === 'string' ? req.route.path : req.path;
    return `${basePath}${routePath}` || req.path || 'unmatched';
  }

  if (req.path === '/metrics') return '/metrics';
  if (req.path === '/health') return '/health';
  return 'unmatched';
}

export function httpMetricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const durationSeconds = Number(process.hrtime.bigint() - startTime) / 1_000_000_000;
    const labels = {
      method: req.method,
      route: normalizeRoute(req),
      status_code: String(res.statusCode),
    };

    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });

  next();
}

