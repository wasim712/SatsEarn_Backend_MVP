import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { clientErrorMessage } from '../../utils/client-error.util';

const isDatabaseConnectionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : '';
  return (
    name === 'PrismaClientInitializationError' ||
    message.includes("Can't reach database server") ||
    message.includes('P1001') ||
    message.includes('P1002') ||
    message.includes('Connection terminated unexpectedly') ||
    message.includes('Timed out fetching a new connection from the pool')
  );
};

const handleAuthError = (res: Response, error: unknown) => {
  if (isDatabaseConnectionError(error)) {
    return res.status(503).json({
      error: 'Database is temporarily unreachable. Please try again in a moment.',
    });
  }

  return res.status(400).json({ error: clientErrorMessage(error) });
};

export class AuthController {
 static async signup (req: Request, res: Response) {
  try {
    // 1. Safely extract IP from Express
    const clientIp = req.ip || req.headers['x-forwarded-for']?.toString() || 'UNKNOWN';

    // 2. Pass it into the service
    const result = await AuthService.signUp({
      ...req.body,
      clientIp // <-- Handing it off!
    });
  
    res.status(201).json(result);
  } catch (error) {
    handleAuthError(res, error);
  }
};

  static async verifyOtp(req: Request, res: Response) {
    try {
      const { email, token, password } = req.body;
      const result = await AuthService.verifyOtp(email, token, password);
      res.status(200).json(result);
    } catch (error) {
      handleAuthError(res, error);
    }
  }

  static async signin  (req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const clientIp = req.ip || req.headers['x-forwarded-for']?.toString() || 'UNKNOWN';

    // Pass the IP as the third argument
    const result = await AuthService.signIn(email, password, clientIp);

    res.status(200).json(result);
  } catch (error) {
    handleAuthError(res, error);
  }
};

  // Add these inside your AuthController class

  static async requestPasswordReset(req: Request, res: Response) {
    try {
      const result = await AuthService.requestPasswordReset(req.body.email);
      res.status(200).json(result);
    } catch (error) {
      handleAuthError(res, error);
    }
  }

  static async resetPassword(req: Request, res: Response) {
    try {
      const { email, token, newPassword } = req.body;
      const result = await AuthService.resetPassword(email, token, newPassword);
      res.status(200).json(result);
    } catch (error) {
      handleAuthError(res, error);
    }
  }
static async checkUsername(req: Request, res: Response) {
  const { username } = req.query as { username: string };

  if (!username) {
    return res.status(400).json({ error: "Username is required" });
  }

  const result = await AuthService.checkUsername(username);

  return res.status(200).json(result); // ✅ FIXED
}
}
