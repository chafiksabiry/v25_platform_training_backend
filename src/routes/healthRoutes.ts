import { Router } from 'express';
import * as healthController from '../controllers/healthController';

const router = Router();

router.get('/health', healthController.healthCheck);
router.get('/cors-test', healthController.corsTest);

export default router;
