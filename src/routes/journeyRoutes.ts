import { Router } from 'express';
import * as journeyController from '../controllers/journeyController';
import { authenticate, authorize } from '../middleware/auth';
import { createJourneyValidation } from '../middleware/validator';

const router = Router();

router.use(authenticate);

router.post('/', authorize('trainer', 'admin'), createJourneyValidation, journeyController.createJourney);
router.get('/', journeyController.getAllJourneys);
router.get('/dashboard', authorize('trainer', 'admin'), journeyController.getTrainerDashboard);
router.get('/status/:status', journeyController.getJourneysByStatus);
router.get('/:id', journeyController.getJourneyById);
router.put('/:id', authorize('trainer', 'admin'), journeyController.updateJourney);
router.post('/:id/launch', authorize('trainer', 'admin'), journeyController.launchJourney);
router.delete('/:id', authorize('trainer', 'admin'), journeyController.deleteJourney);
router.patch('/:id/archive', authorize('trainer', 'admin'), journeyController.archiveJourney);

export default router;
