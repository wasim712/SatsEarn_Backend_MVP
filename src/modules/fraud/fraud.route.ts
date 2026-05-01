import { Router } from 'express';
import { requireAdmin } from '../../middlewares/admin.middleware';
import { requireAuth } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { FraudController } from './fraud.controller';
import { getFraudReportSchema } from './fraud.schema';

const router = Router();

router.use(requireAuth, requireAdmin);

router.get('/fraud/high-risk', FraudController.getHighRiskQueue);
router.get('/fraud/users/:id', validate(getFraudReportSchema), FraudController.getUserFraudReport);

export default router;
