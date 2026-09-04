import { Router } from 'express';
import { protect } from '../middleware/auth';
import studentPortalController from '../controllers/StudentPortalController';

const router = Router();

router.use(protect);

router.get('/dashboard', studentPortalController.getDashboard);

export default router;
