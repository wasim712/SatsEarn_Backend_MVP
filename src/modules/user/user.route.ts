import { Router, Request, Response, NextFunction } from 'express';
import { UserController } from './user.controller';
import { updateProfileSchema } from './user.schema';
import { requireAuth } from '../../middlewares/auth.middleware';
import { ZodObject } from 'zod';

const router = Router();

const validate = (schema: ZodObject) => 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({ body: req.body });
      next();
    } catch (error: any) {
      return res.status(400).json({ error: error.errors });
    }
  };

// Apply requireAuth middleware so only logged-in users can hit these routes
router.get('/profile', requireAuth, UserController.getProfile);
router.patch('/profile', requireAuth, validate(updateProfileSchema), UserController.updateProfile);

export default router;