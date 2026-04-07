import { Router } from 'express';
import * as aiController from '../controllers/aiController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// router.use(authenticate); // Disabled auth

router.post(
  '/generate-training/:gigId',
  aiController.generateTrainingFromGig
);

export default router;
