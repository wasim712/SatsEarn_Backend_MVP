import { Request, Response } from 'express';
import { UserService } from '../user.service';

export const userAccountHandlers = {
  async getDashboard(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getUserDashboard(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async getProfile(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getUserProfile(req.user!.id)); }
    catch (error: any) { res.status(404).json({ error: error.message }); }
  },
  async updateProfile(req: Request, res: Response) {
    try { res.status(200).json({ message: 'Profile updated', profile: await UserService.updateProfile(req.user!.id, req.body) }); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async changePassword(req: Request, res: Response) {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
      }
      res.status(200).json(await UserService.changePassword(req.user!.id, newPassword));
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async deleteAccount(req: Request, res: Response) {
    try { res.status(200).json(await UserService.deleteAccount(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  },
  async getWithdrawals(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getUserWithdrawals(req.user!.id)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async requestWithdrawal(req: Request, res: Response) {
    try {
      const { amountSats, lightningInvoice } = req.body;
      const withdrawal = await UserService.requestWithdrawal(req.user!.id, amountSats, lightningInvoice);
      res.status(201).json({ message: 'Withdrawal requested successfully.', withdrawal });
    } catch (error: any) { res.status(400).json({ error: error.message }); }
  },
  async activeAnnouncement(_req: Request, res: Response) {
    try { res.status(200).json(await UserService.getActiveAnnouncements()); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  },
};
