import { Router } from 'express';
import interviewRoutes from './interview.routes';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import adminRoutes from './admin.routes';
import subscriptionRoutes from './subscription.routes';
import questionSetRoutes from './questionSet.routes';

const router = Router();

router.use('/interview', interviewRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/question-sets', questionSetRoutes);

export default router;
