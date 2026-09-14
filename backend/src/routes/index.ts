import { Router } from 'express';
import interviewRoutes from './interview.routes';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import adminRoutes from './admin.routes';
import subscriptionRoutes from './subscription.routes';
import billingRoutes from './billing.routes';
import questionSetRoutes from './questionSet.routes';
import organizationRoutes from './organization.routes';
import organizationInvitationRoutes from './organizationInvitation.routes';
import studentPortalRoutes from './studentPortal.routes';
import publicEmployerInterviewInvitationRoutes from './publicEmployerInterviewInvitation.routes';
import emailWebhookRoutes from './emailWebhook.routes';
import devStorageRoutes from './devStorage.routes';
import privacyRoutes from './privacy.routes';

const router = Router();

router.use('/interview', interviewRoutes);
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/subscription', subscriptionRoutes);
router.use('/billing', billingRoutes);
router.use('/question-sets', questionSetRoutes);
router.use('/organizations', organizationRoutes);
router.use('/organization-invitations', organizationInvitationRoutes);
router.use('/student-portal', studentPortalRoutes);
// Fully public (no `protect`, no organization RBAC) — 20D candidate interview invitation access/acceptance.
router.use('/public/employer-interview-invitations', publicEmployerInterviewInvitationRoutes);
router.use('/webhooks/email', emailWebhookRoutes);
// Dev/local-only signed-read backing route for the LOCAL storage provider — inert in production (see storage/index.ts).
router.use('/dev-storage', devStorageRoutes);
// Privacy/data-lifecycle (PR-PRIVACY) — export, account deletion, consent. `/policy-config` is public; everything else requires auth.
router.use('/privacy', privacyRoutes);

export default router;
