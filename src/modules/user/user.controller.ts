import { Request, Response } from 'express';
import { UserService } from './user.service';

export class UserController {
  static async getProfile(req: Request, res: Response) {
    try {
      // req.user is populated by the requireAuth middleware
      const userId = req.user!.id; 
      const profile = await UserService.getProfile(userId);
      res.status(200).json(profile);
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  static async updateProfile(req: Request, res: Response) {
    try {
      const userId = req.user!.id;
      const updatedProfile = await UserService.updateProfile(userId, req.body);
      res.status(200).json(updatedProfile);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}