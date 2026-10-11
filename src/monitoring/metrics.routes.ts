import { Router } from 'express';
import { register } from 'prom-client';
import { getMetricsPayload } from './prometheus';
import { CryptoUtil } from '../utils/crypto.util';

const router = Router();

// Metrics expose routes, error rates and business counters, so they need a scraper token.
// Without METRICS_TOKEN the endpoint is open in development and hidden (404) in production.
router.use((req, res, next) => {
  const expected = process.env.METRICS_TOKEN;

  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).end();
      return;
    }
    next();
    return;
  }

  const header = req.headers.authorization || '';
  const provided = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!CryptoUtil.safeEqual(provided, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
});

router.get('/', async (_req, res, next) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    res.status(200).send(await getMetricsPayload());
  } catch (error) {
    next(error);
  }
});

export default router;
