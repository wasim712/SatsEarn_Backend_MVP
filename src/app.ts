import express from 'express';
import cors from 'cors';

import authRoutes from './modules/auth/auth.route';
import userRoutes from './modules/user/user.route'; 
import adminRoutes from './modules/admin/admin.route';

import { routeLogger } from './middlewares/logger.middleware'; // 1. Import it

const app = express();

app.use(cors());
app.use(express.json());

// 2. Add the logger here so it catches EVERYTHING
app.use(routeLogger); 

app.use('/api/auth', authRoutes);

// Add this below your user routes
app.use('/api/admin', adminRoutes);

// Add this below app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'SatsEarn API is running' });
});

export default app;