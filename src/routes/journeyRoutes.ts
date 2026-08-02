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
router.get('/trainer/companyId/:companyId/gigId/:gigId', journeyController.getJourneysByCompanyAndGig);
router.post('/trainer/companyId/:companyId/participants-progress', journeyController.getCompanyParticipantsProgress);
router.get('/status/:status', journeyController.getJourneysByStatus);
// Must be before /:id so static segments are not parsed as Mongo ids
router.get('/rep-progress', journeyController.getRepProgress);
router.get('/progress/:repId/:courseId', journeyController.getStructuredProgress);
router.post('/section/start', journeyController.startSectionProgress);
router.post('/section/complete', journeyController.completeSectionProgress);
router.post('/quiz/start', journeyController.startQuizProgress);
router.post('/quiz/submit', journeyController.submitQuizProgress);
router.post('/rep-progress', journeyController.upsertRepProgress);
router.post('/tracking-events', journeyController.postTrainingTrackingEvent);
router.get('/tracking-events', journeyController.listTrainingTrackingEvents);
router.get('/rep/:repId/trainings-progress', journeyController.getTrainingProgressByRep);
router.get('/rep/:repId/progress/gig/:gigId', journeyController.getRepProgressByGig);
router.get('/rep/:repId/progress-summary', journeyController.getRepProgressSummary);
router.get('/rep/:repId/slide-progress-summary', journeyController.getRepSlideProgressSummary);
router.get('/rep/:repId/training-tracking', journeyController.listTrainingTrackingByRep);
router.get('/certification/:repId/:journeyId', journeyController.getCertification);
router.get('/journey/:journeyId/reps-progress', journeyController.getRepProgressByTraining);
router.get('/gig/:gigId', journeyController.listJourneysByGig);
router.post('/generate-thumbnail', journeyController.generateTrainingThumbnail);
router.post('/suggest-vision', journeyController.suggestTrainingVision);
router.post('/suggest-target-roles', journeyController.suggestTargetRoles);
router.get('/rep/:repId', journeyController.getJourneysForRep);
router.get('/:id', journeyController.getJourneyById);
router.put('/:id', journeyController.updateJourney);
router.post('/:id/edit-with-prompt', journeyController.editJourneyWithPrompt);
router.post('/:id/launch', journeyController.launchJourney);
router.delete('/:id', journeyController.deleteJourney);
router.patch('/:id/archive', journeyController.archiveJourney);

export default router;

