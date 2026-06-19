import { Router } from 'express';
import { register } from 'prom-client';
import { getMetricsPayload } from './prometheus';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    res.setHeader('Content-Type', register.contentType);
    res.status(200).send(await getMetricsPayload());
  } catch (error) {
    next(error);
  }
});

export default router;
