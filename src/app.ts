import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
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
app.set('trust proxy', true);

const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
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
  }),
);

app.use(express.json());
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
