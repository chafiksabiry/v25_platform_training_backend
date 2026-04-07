import { Router } from 'express';
import * as aiController from '../controllers/aiController';
import upload from '../middleware/upload';

const router = Router();

router.post(
  '/generate-training/:gigId',
  aiController.generateTrainingFromGig
);

router.post(
  '/analyze-document',
  upload.single('file'),
  aiController.analyzeDocument
);

router.post(
  '/generate-program',
  aiController.generateProgramFromAnalysis
);

export default router;
