import express from 'express';
import cors from 'cors';

// Security
import helmet from 'helmet'
import rateLimit from 'express-rate-limit';
// Routes
import authRoutes from './modules/auth/auth.route';
import userRoutes from './modules/user/user.route'; 
import adminRoutes from './modules/admin/admin.route';

import { routeLogger } from './middlewares/logger.middleware';
import { limiter } from './middlewares/rate-limit';

const app = express();
app.use(helmet());

// 2. Rate Limiting (Global)

app.use('/api/', limiter);
app.use(cors( {origin : 'https://sats-earn-frontend.vercel.app'}));
app.use(express.json());
app.use(routeLogger); 

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

app.use('/api/users', userRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'SatsEarn API is running' });
});

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Critical Error:", err.stack);
  res.status(500).json({ 
    error: "Something went wrong internally.",
    message: process.env.NODE_ENV === 'development' ? err.message : undefined 
  });
});
export default app;