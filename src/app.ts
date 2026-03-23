import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/auth.route';
import { routeLogger } from './middlewares/logger.middleware'; // 1. Import it

const app = express();

app.use(cors());
app.use(express.json());

// 2. Add the logger here so it catches EVERYTHING
app.use(routeLogger); 

app.use('/api/auth', authRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'SatsEarn API is running' });
});

export default app;