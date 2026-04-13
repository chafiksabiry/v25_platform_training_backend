import { Router } from 'express';
import * as journeyController from '../controllers/journeyController';
import { authenticate, authorize } from '../middleware/auth';
import { createJourneyValidation } from '../middleware/validator';

const router = Router();

// router.use(authenticate); // Disabled auth

router.post('/', createJourneyValidation, journeyController.createJourney);
router.get('/', journeyController.getAllJourneys);
router.get('/dashboard', journeyController.getTrainerDashboard);
router.get('/trainer/companyId/:companyId', journeyController.getTrainerDashboard); // Legacy compatibility route
router.get('/status/:status', journeyController.getJourneysByStatus);
// Must be before /:id so "rep" is not parsed as a journey id
router.get('/rep/:repId', journeyController.getJourneysForRep);
router.get('/:id', journeyController.getJourneyById);
router.put('/:id', journeyController.updateJourney);
router.post('/:id/edit-with-prompt', journeyController.editJourneyWithPrompt);
router.post('/:id/launch', journeyController.launchJourney);
router.delete('/:id', journeyController.deleteJourney);
router.patch('/:id/archive', journeyController.archiveJourney);

export default router;

