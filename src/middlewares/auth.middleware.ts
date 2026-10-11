import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.client';
import { User } from '@prisma/client';
import { isValidTimeZone } from '../utils/reward.util';
import { verifySessionToken } from '../utils/jwt.util';

// 1. Extend the Express Request type to include our Prisma User
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export const requireAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.split(' ')[1];

    if (!process.env.JWT_SECRET) {
      res.status(500).json({ error: 'Authentication is not configured on the server.' });
      return;
    }

    const decoded = verifySessionToken(token);

    if (!decoded?.userId) {
      res.status(401).json({ error: 'Unauthorized: Invalid token payload.' });
      return;
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!dbUser || !dbUser.isActive) {
      res.status(401).json({ error: 'Unauthorized: Account deactivated or deleted.' });
      return;
    }

    // Password change/reset bumps tokenVersion, which revokes every token issued before it.
    if ((decoded.tv ?? 0) !== dbUser.tokenVersion) {
      res.status(401).json({ error: 'Unauthorized: Session expired. Please log in again.' });
      return;
    }

    const timezoneHeader = req.headers['x-timezone'];
    const clientTimezone = Array.isArray(timezoneHeader) ? timezoneHeader[0] : timezoneHeader;

    if (clientTimezone && clientTimezone !== dbUser.timezone && isValidTimeZone(clientTimezone)) {
      dbUser.timezone = clientTimezone;
      prisma.user
        .update({ where: { id: dbUser.id }, data: { timezone: clientTimezone } })
        .catch((err) => console.error('Failed to persist user timezone:', err));
    }

    req.user = dbUser;
    next();
    
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Unauthorized: Session expired. Please log in again.' });
      return;
    }
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Unauthorized: Invalid token.' });
      return;
    }

    if (error.code === 'P2023' || error.message?.toLowerCase().includes('uuid')) {
      res.status(401).json({ error: 'Unauthorized: Invalid user token.' });
      return;
    }
    
    console.error('Auth Middleware Error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
};
