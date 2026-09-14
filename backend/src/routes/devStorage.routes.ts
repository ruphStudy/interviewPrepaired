import { Router } from 'express';
import { readDevStorageObject } from '../controllers/devStorage.controller';

const router = Router();

// No `protect` — this URL's own HMAC signature + expiry (verified inside the
// controller) is the authorization mechanism, mirroring how a real cloud
// presigned URL works. Inert whenever the local provider isn't active.
router.get('/read', readDevStorageObject);

export default router;
