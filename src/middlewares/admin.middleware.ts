import { Request, Response, NextFunction } from 'express';

export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized: User not found' });
      return;
    }

    if (req.user.role !== 'SUPER_ADMIN') {
      res.status(403).json({ error: 'Forbidden: Super Admin access required' });
      return;
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Internal server error during admin authorization' });
  }
};