import { Router } from 'express';
import * as journeyController from '../controllers/journeyController';
import { authenticate, authorize } from '../middleware/auth';
import { createJourneyValidation } from '../middleware/validator';

const router = Router();

// router.use(authenticate); // Disabled auth

router.post('/', createJourneyValidation, journeyController.createJourney);
router.get('/', journeyController.getAllJourneys);
router.get('/dashboard', journeyController.getTrainerDashboard);
router.get('/status/:status', journeyController.getJourneysByStatus);
router.get('/:id', journeyController.getJourneyById);
router.put('/:id', journeyController.updateJourney);
router.post('/:id/launch', journeyController.launchJourney);
router.delete('/:id', journeyController.deleteJourney);
router.patch('/:id/archive', journeyController.archiveJourney);

export default router;
