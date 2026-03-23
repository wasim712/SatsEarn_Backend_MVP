import { Router, Request, Response, NextFunction } from 'express';
import { AuthController } from './auth.controller';
import { signUpSchema, verifyOtpSchema, signInSchema } from './auth.schema';
import { ZodObject } from 'zod';

const router = Router();

// Simple Zod Validation Middleware 
const validate = (schema: ZodObject) => 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({ body: req.body });
      next();
    } catch (error: any) {
      return res.status(400).json({ error: error.errors });
    }
  };

router.post('/signup', validate(signUpSchema), AuthController.signUp);
router.post('/verify-otp', validate(verifyOtpSchema), AuthController.verifyOtp);
router.post('/signin', validate(signInSchema), AuthController.signIn);

export default router;