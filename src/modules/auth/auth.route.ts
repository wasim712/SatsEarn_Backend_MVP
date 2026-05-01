import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware';
import { AuthController } from './auth.controller';
import {
  checkUsername,
  requestPasswordResetSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyOtpSchema,
} from './auth.schema';

const router = Router();

router.post('/signup', validate(signUpSchema), AuthController.signup);
router.post('/verify-otp', validate(verifyOtpSchema), AuthController.verifyOtp);
router.post('/signin', validate(signInSchema), AuthController.signin);
router.post('/forgot-password', validate(requestPasswordResetSchema), AuthController.requestPasswordReset);
router.post('/reset-password', validate(resetPasswordSchema), AuthController.resetPassword);
router.get('/check-username', validate(checkUsername), AuthController.checkUsername);

export default router;
