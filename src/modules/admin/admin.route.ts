import { Router, Request, Response, NextFunction } from 'express';
import { AdminController } from './admin.controller';
import { requireAuth } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';
import { createCampaignSchema, updateCampaignSchema } from './admin.schema'; // 1. Import schema
import { ZodObject } from 'zod';

const router = Router();

// Zod Validation Middleware
const validate = (schema: ZodObject) => 
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({ body: req.body });
      next();
    } catch (error: any) {
      return res.status(400).json({ error: error.errors });
    }
  };

router.use(requireAuth, requireAdmin);

router.get('/metrics', AdminController.getDashboardMetrics);

// 2. Add the new campaign creation route
router.post('/campaigns', validate(createCampaignSchema), AdminController.createCampaign);
// Add this BELOW your other routes, inside admin.route.ts
// GET /api/admin/campaigns/:id/analytics
router.get('/campaigns/:id/analytics', AdminController.getCampaignAnalytics);
// GET all campaigns
router.get('/campaigns', AdminController.getAllCampaigns);

// GET a single campaign
router.get('/campaigns/:id', AdminController.getCampaignById);

// UPDATE a campaign
router.patch('/campaigns/:id', validate(updateCampaignSchema), AdminController.updateCampaign);

// DELETE a campaign
router.delete('/campaigns/:id', AdminController.deleteCampaign);

export default router;