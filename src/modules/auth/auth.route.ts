import { Router } from 'express';
import { authLimits } from '../../middlewares/rate-limit';
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

router.post('/signup', authLimits.signup, validate(signUpSchema), AuthController.signup);
router.post('/verify-otp', authLimits.verifyOtp, validate(verifyOtpSchema), AuthController.verifyOtp);
router.post('/signin', authLimits.signin, validate(signInSchema), AuthController.signin);
router.post('/forgot-password', authLimits.forgotPassword, validate(requestPasswordResetSchema), AuthController.requestPasswordReset);
router.post('/reset-password', authLimits.resetPassword, validate(resetPasswordSchema), AuthController.resetPassword);
router.get('/check-username', validate(checkUsername), AuthController.checkUsername);

export default router;
