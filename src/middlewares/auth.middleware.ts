import { Request, Response, NextFunction } from 'express';
import { supabase } from '../external/supabase.client';
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

    // 3. Verify the token with Supabase's auth server
    // This automatically checks if the token is expired or revoked
    const { data: { user: supabaseUser }, error } = await supabase.auth.getUser(token);

    if (error || !supabaseUser) {
      res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
      return;
    }

    // 4. Fetch the full user profile from our PostgreSQL database
    const dbUser = await prisma.user.findUnique({
      where: { supabaseAuthId: supabaseUser.id },
    });

    if (!dbUser) {
      res.status(401).json({ error: 'Unauthorized: User not found in database' });
      return;
    }

    // 5. Attach the user to the request and proceed to the controller
    req.user = dbUser;
    next();
  } catch (error: any) {
    console.error('Auth Middleware Error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
};