import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma.client';
import { User } from '@prisma/client';

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
    // 2. Extract the token from the Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid authorization header' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      throw new Error("JWT_SECRET is completely missing from environment variables.");
    }

    // 3. Verify the token using our local JWT secret
    // This will automatically throw an error if the token is expired or tampered with
    const decoded = jwt.verify(token, secret) as { userId: string, role: string };

    // 4. Fetch the full user profile from our PostgreSQL database using the native ID
    const dbUser = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    // ADD THE `!dbUser.isActive` CHECK HERE
    if (!dbUser || !dbUser.isActive) {
      res.status(401).json({ error: 'Unauthorized: Account deactivated or deleted.' });
      return;
    }

    // 5. Attach the user to the request and proceed to the controller
    req.user = dbUser;
    next();
    
  } catch (error: any) {
    // Provide specific error messages for the frontend to handle easily
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Unauthorized: Session expired. Please log in again.' });
      return;
    }
    if (error.name === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Unauthorized: Invalid token.' });
      return;
    }
    
    console.error('Auth Middleware Error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
};