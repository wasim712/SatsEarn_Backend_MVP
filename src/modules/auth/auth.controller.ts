import { Request, Response } from 'express';
import { AuthService } from './auth.service';

export class AuthController {
  static async signUp(req: Request, res: Response) {
    try {
      const result = await AuthService.signUp(req.body);
      res.status(201).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async verifyOtp(req: Request, res: Response) {
    try {
      const { email, token } = req.body;
      const result = await AuthService.verifyOtp(email, token);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async signIn(req: Request, res: Response) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.signIn(email, password);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(401).json({ error: error.message });
    }
  }

  // Add these inside your AuthController class

  static async requestPasswordReset(req: Request, res: Response) {
    try {
      const result = await AuthService.requestPasswordReset(req.body.email);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async resetPassword(req: Request, res: Response) {
    try {
      const { email, token, newPassword } = req.body;
      const result = await AuthService.resetPassword(email, token, newPassword);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
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