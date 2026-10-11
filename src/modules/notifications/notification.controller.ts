import { Request, Response } from 'express';
import { NotificationService } from './notification.service';
import { clientErrorMessage } from '../../utils/client-error.util';

export class NotificationController {
  
  // ─── USER CONTROLLERS ───
  static async getMyNotifications(req: Request, res: Response) {
    try {
      const data = await NotificationService.getUserNotifications(req.user!.id);
      res.json(data);
    } catch (e: any) { res.status(400).json({ error: clientErrorMessage(e) }); }
  }

  static async markAllMyRead(req: Request, res: Response) {
    try {
      await NotificationService.markAllUserRead(req.user!.id);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: clientErrorMessage(e) }); }
  }

  // ─── ADMIN CONTROLLERS ───
  static async getAdminAlerts(req: Request, res: Response) {
    try {
      const data = await NotificationService.getAdminNotifications();
      res.json(data);
    } catch (e: any) { res.status(400).json({ error: clientErrorMessage(e) }); }
  }

  static async markAllAdminRead(req: Request, res: Response) {
    try {
      await NotificationService.markAllAdminRead();
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: clientErrorMessage(e) }); }
  }

  // ─── SHARED CONTROLLER (Single Read) ───
  static async markRead(req: Request, res: Response) {
    try {
      // If the user is NOT a SUPER_ADMIN, enforce that they can only read their own notifications
      const userId = req.user!.role === 'SUPER_ADMIN' ? undefined : req.user!.id;
      
      await NotificationService.markAsRead(req.params.id as string, userId);
      res.json({ success: true });
    } catch (e: any) { res.status(400).json({ error: clientErrorMessage(e) }); }
  }
}