import { Router, Request, Response, NextFunction } from "express";
import { AuthController } from "./auth.controller";
import {
    signUpSchema,
    verifyOtpSchema,
    signInSchema,
    requestPasswordResetSchema,
    resetPasswordSchema,
    checkUsername,
} from "./auth.schema";
import { ZodObject } from "zod";

const router = Router();

// Simple Zod Validation Middleware
const validate =
    (schema: ZodObject) =>
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                await schema.parseAsync({ body: req.body });
                next();
            } catch (error: any) {
                return res.status(400).json({ error: error.errors });
            }
        };

router.post("/signup", validate(signUpSchema), AuthController.signUp);
router.post("/verify-otp", validate(verifyOtpSchema), AuthController.verifyOtp);
router.post("/signin", validate(signInSchema), AuthController.signIn);
router.post(
    "/forgot-password",
    validate(requestPasswordResetSchema),
    AuthController.requestPasswordReset,
);
router.post(
    "/reset-password",
    validate(resetPasswordSchema),
    AuthController.resetPassword,
);
router.get(
    "/check-username",
    validate(checkUsername),
    AuthController.checkUsername,
);
export default router;
