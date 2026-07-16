import { Router } from 'express';
import {
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  getUserStats,
} from '../controllers/user.controller';
import { protect, authorize } from '../middleware/auth';

const router = Router();

router.use(protect);

router.get('/', authorize('admin'), getUsers);
router.get('/stats', getUserStats);
router.get('/:id', getUser);
router.put('/:id', updateUser);
router.delete('/:id', authorize('admin'), deleteUser);

export default router;
