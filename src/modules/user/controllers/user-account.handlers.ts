import { Request, Response } from 'express';
import { UserService } from '../user.service';
import { clientErrorMessage } from '../../../utils/client-error.util';

export const userAccountHandlers = {
  async getDashboard(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getUserDashboard(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getLeaderboard(_req: Request, res: Response) {
    try { res.status(200).json(await UserService.getLeaderboard()); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getProfile(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getUserProfile(req.user!.id)); }
    catch (error: any) { res.status(404).json({ error: clientErrorMessage(error) }); }
  },
  async completeOnboarding(req: Request, res: Response) {
    try { res.status(200).json(await UserService.completeOnboarding(req.user!.id)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async skipOnboarding(req: Request, res: Response) {
    try { res.status(200).json(await UserService.skipOnboarding(req.user!.id)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async updateProfile(req: Request, res: Response) {
    try { res.status(200).json({ message: 'Profile updated', profile: await UserService.updateProfile(req.user!.id, req.body) }); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async registerPremiumInterest(req: Request, res: Response) {
    try { res.status(200).json(await UserService.registerPremiumInterest(req.user!.id, req.body)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async upgradePremiumUsingSats(req: Request, res: Response) {
    try { res.status(200).json(await UserService.upgradePremiumUsingSats(req.user!.id, req.body)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async getPremiumRequests(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getPremiumRequests(req.user!.id)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async changePassword(req: Request, res: Response) {
    try {
      const { currentPassword, newPassword } = req.body;
      res.status(200).json(await UserService.changePassword(req.user!.id, currentPassword, newPassword));
    } catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async deleteAccount(req: Request, res: Response) {
    try { res.status(200).json(await UserService.deleteAccount(req.user!.id)); }
    catch (error: any) { res.status(500).json({ error: clientErrorMessage(error) }); }
  },
  async getWithdrawals(req: Request, res: Response) {
    try { res.status(200).json(await UserService.getUserWithdrawals(req.user!.id)); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async requestWithdrawal(req: Request, res: Response) {
    try {
      const { amountSats, lightningInvoice } = req.body;
      const withdrawal = await UserService.requestWithdrawal(req.user!.id, amountSats, lightningInvoice);
      res.status(201).json({ message: 'Withdrawal requested successfully.', withdrawal });
    } catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
  async activeAnnouncement(_req: Request, res: Response) {
    try { res.status(200).json(await UserService.getActiveAnnouncements()); }
    catch (error: any) { res.status(400).json({ error: clientErrorMessage(error) }); }
  },
};
