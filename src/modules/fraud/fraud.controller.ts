import { Request, Response } from 'express';
import { FraudService } from './fraud.service'; // Make sure this file exists from our previous step!

export class FraudController {
  
  // Fetch a specific user's detailed fraud report
  static async getUserFraudReport(req: Request, res: Response) {
    try {
      const userId = req.params.id;
      const report = await FraudService.analyzeUserRisk(userId as string);
      res.json(report);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // Fetch all users with pending withdrawals who have a high risk score
  static async getHighRiskQueue(req: Request, res: Response) {
    try {
      const queue = await FraudService.getHighRiskUsers();
      res.json(queue);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}