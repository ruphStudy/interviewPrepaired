import { Router } from 'express';
import interviewRoutes from './interview.routes';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import adminRoutes from './admin.routes';
import subscriptionRoutes from './subscription.routes';
import questionSetRoutes from './questionSet.routes';
import organizationRoutes from './organization.routes';
import organizationInvitationRoutes from './organizationInvitation.routes';
import studentPortalRoutes from './studentPortal.routes';

const router = Router();

router.use('/interview', interviewRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/question-sets', questionSetRoutes);
router.use('/organizations', organizationRoutes);
router.use('/organization-invitations', organizationInvitationRoutes);
router.use('/student-portal', studentPortalRoutes);

export default router;
