import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { httpMetricsMiddleware } from './monitoring/http-metrics.middleware';
import metricsRoutes from './monitoring/metrics.routes';
import { decryptObfuscatedJson, encryptObfuscatedResponse } from './middlewares/obfuscation.middleware';
import { errorHandler } from './middlewares/error.middleware';
import { routeLogger } from './middlewares/logger.middleware';
import { limiter } from './middlewares/rate-limit';
import adminRoutes from './modules/admin/admin.route';
import authRoutes from './modules/auth/auth.route';
import fraudRoutes from './modules/fraud/fraud.route';
import publicRoutes from './modules/public/public.route';
import userRoutes from './modules/user/user.route';

const app = express();

app.use(helmet());
// Number of reverse proxies in front of the API. Without it, req.ip is the load balancer for every
// user, so per-IP rate limits become one shared bucket and fraud IP signals record the proxy.
// Never set this higher than the real hop count, or clients can spoof X-Forwarded-For.
app.set('trust proxy', env.TRUST_PROXY_HOPS ?? (env.NODE_ENV === 'production' ? 1 : 0));

const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:3001',
  "https://satsearn.app"
];


app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Timezone', 'x-obfuscated', 'x-obfuscated-response', 'x-obfuscated-multipart'],
  }),
);

app.use(httpMetricsMiddleware);
app.use(express.json());
app.use('/metrics', metricsRoutes);
app.use(decryptObfuscatedJson);
app.use(encryptObfuscatedResponse);
app.use(routeLogger);

app.use('/api/auth', limiter);
app.use('/api/security', limiter);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/security', fraudRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK', message: 'SatsEarn API is running' });
});

app.use(errorHandler);

export default app;
