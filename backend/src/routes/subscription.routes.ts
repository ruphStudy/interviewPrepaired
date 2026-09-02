import { Router } from 'express';
import { getActivePlans } from '../controllers/subscription.controller';

const router = Router();

router.get('/plans', getActivePlans);

export default router;
