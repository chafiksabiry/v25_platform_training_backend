import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import trainingJourneyService from '../services/trainingJourneyService';
import { asyncHandler } from '../middleware/errorHandler';
import cloudinaryService from '../services/cloudinaryService';
import aiService from '../services/aiService';

export const createJourney = asyncHandler(async (req: AuthRequest, res: Response) => {
  console.log('📦 [createJourney] Received body keys:', Object.keys(req.body));
  const { presentationData, filetraining, ...journeyData } = req.body;
  
  if (presentationData) {
    console.log('📊 [createJourney] presentationData found, slides count:', presentationData.slides?.length);
    try {
      const fileName = `presentation_${Date.now()}`;
      const uploadResult = await cloudinaryService.uploadJsonData(presentationData, fileName);
      journeyData.presentationUrl = uploadResult.url;
    } catch (error) {
      console.error('Failed to upload presentation to Cloudinary:', error);
    }
    // Persist the full AI-generated presentation in the database
    journeyData.presentation = presentationData;
  }

  // Persist the PPTX file URL
  if (filetraining) {
    console.log('📎 [createJourney] filetraining URL found:', filetraining);
    journeyData.filetraining = filetraining;
  }

  const journey = await trainingJourneyService.saveJourney(journeyData);
  res.status(201).json({
    success: true,
    journey
  });
});

export const updateJourney = asyncHandler(async (req: AuthRequest, res: Response) => {
  console.log('📦 [updateJourney] Received body keys:', Object.keys(req.body));
  const { presentationData, filetraining, ...journeyData } = req.body;
  
  if (presentationData) {
    console.log('📊 [updateJourney] presentationData found, slides count:', presentationData.slides?.length);
    try {
      const fileName = `presentation_${Date.now()}`;
      const uploadResult = await cloudinaryService.uploadJsonData(presentationData, fileName);
      journeyData.presentationUrl = uploadResult.url;
    } catch (error) {
      console.error('Failed to upload presentation to Cloudinary:', error);
    }
    journeyData.presentation = presentationData;
  }

  if (filetraining) {
    console.log('📎 [updateJourney] filetraining URL found:', filetraining);
    journeyData.filetraining = filetraining;
  }

  const journey = await trainingJourneyService.saveJourney({
    _id: req.params.id,
    ...journeyData
  });
  res.status(200).json({
    success: true,
    journey
  });
});

export const getJourneyById = asyncHandler(async (req: AuthRequest, res: Response) => {
  const journey = await trainingJourneyService.getJourneyById(req.params.id);
  res.status(200).json(journey);
});

export const getAllJourneys = asyncHandler(async (req: AuthRequest, res: Response) => {
  const journeys = await trainingJourneyService.getAllJourneys();
  res.status(200).json(journeys);
});

export const getJourneysByStatus = asyncHandler(async (req: AuthRequest, res: Response) => {
  const journeys = await trainingJourneyService.getJourneysByStatus(req.params.status);
  res.status(200).json(journeys);
});

export const launchJourney = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { enrolledRepIds } = req.body;
  const journey = await trainingJourneyService.launchJourney(req.params.id, enrolledRepIds);
  res.status(200).json(journey);
});

export const deleteJourney = asyncHandler(async (req: AuthRequest, res: Response) => {
  await trainingJourneyService.deleteJourney(req.params.id);
  res.status(204).send();
});

export const archiveJourney = asyncHandler(async (req: AuthRequest, res: Response) => {
  const journey = await trainingJourneyService.archiveJourney(req.params.id);
  res.status(200).json(journey);
});

export const editJourneyWithPrompt = asyncHandler(async (req: AuthRequest, res: Response) => {
  const journeyId = req.params.id;
  const { prompt } = req.body || {};

  if (!journeyId) {
    return res.status(400).json({ success: false, error: 'journeyId is required' });
  }
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ success: false, error: 'prompt is required' });
  }

  const journey = await trainingJourneyService.getJourneyById(journeyId);
  const moduleTitles = (journey.modules || []).slice(0, 12).map((m: any) => m.title).filter(Boolean);

  const editPrompt = `
You are editing a training journey metadata using a user prompt.

USER PROMPT:
${prompt}

CURRENT JOURNEY:
- title: ${journey.title || journey.name || ''}
- description: ${journey.description || ''}
- modules: ${moduleTitles.join(' | ')}

TASK:
- Update ONLY title and description according to the user prompt.
- Keep training domain and intent consistent with existing modules.
- Do not invent unrelated domain.
- Return concise, professional result.

RESPONSE FORMAT (strict JSON only):
{
  "title": "new title",
  "description": "new description"
}
`;

  const raw = await aiService.generateWithClaude(
    editPrompt,
    'You are a precise instructional designer. Return ONLY valid JSON.',
    req.headers['x-anthropic-key'] as string | undefined,
    1200,
    { temperature: 0.2 }
  );

  const parsed = aiService.parseJson(raw, 'edit_journey_with_prompt');
  const nextTitle = String(parsed?.title || journey.title || journey.name || '').trim();
  const nextDescription = String(parsed?.description || journey.description || '').trim();

  if (!nextTitle) {
    return res.status(422).json({ success: false, error: 'AI did not return a valid title' });
  }

  const updatedJourney = await trainingJourneyService.saveJourney({
    _id: journeyId as any,
    title: nextTitle as any,
    name: nextTitle as any,
    description: nextDescription as any
  });

  return res.status(200).json({
    success: true,
    journey: updatedJourney,
    applied: {
      title: nextTitle,
      description: nextDescription
    }
  });
});

export const getTrainerDashboard = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { companyId: queryCompanyId, gigId } = req.query;
  const { companyId: pathCompanyId } = req.params;
  
  const companyId = (pathCompanyId || queryCompanyId) as string;
  
  const dashboard = await trainingJourneyService.getTrainerDashboard(
    companyId,
    gigId as string | undefined
  );
  res.status(200).json({
    success: true,
    data: dashboard
  });
});

/** Trainings (journeys) where this rep is enrolled — linked to gig via journey.gigId when set. */
export const getJourneysForRep = asyncHandler(async (req: AuthRequest, res: Response) => {
  const repId = String(req.params.repId || '').trim();
  if (!repId) {
    res.status(400).json({ success: false, error: 'repId is required' });
    return;
  }
  const journeys = await trainingJourneyService.getJourneysForRep(repId);
  res.status(200).json(journeys);
});

/** Used by rep dashboard / gig details — { success, data } (same shape as GigDetails.tsx). */
export const listJourneysByGig = asyncHandler(async (req: AuthRequest, res: Response) => {
  const gigId = String(req.params.gigId || '').trim();
  console.log('[journeyController:listJourneysByGig] incoming request', {
    gigId,
    userId: req.user?.id || null
  });
  if (!gigId) {
    res.status(400).json({ success: false, error: 'gigId is required' });
    return;
  }
  const journeys = await trainingJourneyService.getPublishedJourneysByGigId(gigId);
  console.log('[journeyController:listJourneysByGig] response payload', {
    gigId,
    count: journeys.length,
    journeyIds: journeys.map((j: any) => String(j?._id || j?.id || ''))
  });
  res.status(200).json({ success: true, data: journeys });
});

/** GET /training_journeys/rep-progress?repId=...&journeyId=... */
export const getRepProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const repId = String(req.query.repId || '').trim();
  const journeyId = String(req.query.journeyId || '').trim();
  if (!repId || !journeyId) {
    res.status(400).json({ success: false, error: 'repId and journeyId are required' });
    return;
  }
  const progress = await trainingJourneyService.getRepProgress(repId, journeyId);
  res.status(200).json({ success: true, data: progress });
});

/** POST /training_journeys/rep-progress */
export const upsertRepProgress = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payload = req.body || {};
  const updated = await trainingJourneyService.upsertRepProgress({
    repId: String(payload.repId || ''),
    journeyId: String(payload.journeyId || ''),
    moduleId: payload.moduleId ? String(payload.moduleId) : undefined,
    progress: typeof payload.progress === 'number' ? payload.progress : undefined,
    status: payload.status,
    completedSections: Array.isArray(payload.completedSections) ? payload.completedSections : undefined,
    engagementScore: typeof payload.engagementScore === 'number' ? payload.engagementScore : undefined
  });
  res.status(200).json({ success: true, data: updated });
});

/** GET /training_journeys/rep/:repId/trainings-progress */
export const getTrainingProgressByRep = asyncHandler(async (req: AuthRequest, res: Response) => {
  const repId = String(req.params.repId || '').trim();
  if (!repId) {
    res.status(400).json({ success: false, error: 'repId is required' });
    return;
  }
  const rows = await trainingJourneyService.getTrainingProgressByRep(repId);
  res.status(200).json({ success: true, data: rows });
});

/** GET /training_journeys/rep/:repId/slide-progress-summary — moyenne (slides vus / slides total) par formation */
export const getRepSlideProgressSummary = asyncHandler(async (req: AuthRequest, res: Response) => {
  const repId = String(req.params.repId || '').trim();
  if (!repId) {
    res.status(400).json({ success: false, error: 'repId is required' });
    return;
  }
  const gigId = req.query.gigId != null ? String(req.query.gigId).trim() : '';
  const summary = await trainingJourneyService.getRepSlideProgressSummary(repId, gigId || undefined);
  res.status(200).json({ success: true, data: summary });
});

/** GET /training_journeys/journey/:journeyId/reps-progress */
export const getRepProgressByTraining = asyncHandler(async (req: AuthRequest, res: Response) => {
  const journeyId = String(req.params.journeyId || '').trim();
  if (!journeyId) {
    res.status(400).json({ success: false, error: 'journeyId is required' });
    return;
  }
  const rows = await trainingJourneyService.getRepProgressByTraining(journeyId);
  res.status(200).json({ success: true, data: rows });
});

/** POST /training_journeys/tracking-events — upsert snapshot (repId + journeyId en ObjectId côté DB) */
export const postTrainingTrackingEvent = asyncHandler(async (req: AuthRequest, res: Response) => {
  const payload = req.body || {};
  const doc = await trainingJourneyService.recordTrainingTrackingEvent({
    repId: String(payload.repId || ''),
    journeyId: String(payload.journeyId || ''),
    moduleId: payload.moduleId != null ? String(payload.moduleId) : undefined,
    slideId: payload.slideId != null ? String(payload.slideId) : undefined,
    slideIndex: typeof payload.slideIndex === 'number' ? payload.slideIndex : undefined,
    event: String(payload.event || ''),
    durationMs: typeof payload.durationMs === 'number' ? payload.durationMs : undefined,
    completed: typeof payload.completed === 'boolean' ? payload.completed : undefined
  });
  res.status(201).json({ success: true, data: doc });
});

/** GET /training_journeys/tracking-events?repId=&journeyId=&limit=&skip= */
export const listTrainingTrackingEvents = asyncHandler(async (req: AuthRequest, res: Response) => {
  const repId = String(req.query.repId || '').trim();
  const journeyId = String(req.query.journeyId || '').trim();
  if (!repId || !journeyId) {
    res.status(400).json({ success: false, error: 'repId and journeyId are required' });
    return;
  }
  const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
  const skip = req.query.skip != null ? Number(req.query.skip) : undefined;
  const rows = await trainingJourneyService.listTrainingTrackingEvents({ repId, journeyId, limit, skip });
  res.status(200).json({ success: true, data: rows });
});

/** GET /training_journeys/rep/:repId/training-tracking — toutes les formations suivies par ce rep */
export const listTrainingTrackingByRep = asyncHandler(async (req: AuthRequest, res: Response) => {
  const repId = String(req.params.repId || '').trim();
  if (!repId) {
    res.status(400).json({ success: false, error: 'repId is required' });
    return;
  }
  const rows = await trainingJourneyService.listTrainingTrackingByRep(repId);
  res.status(200).json({ success: true, data: rows });
});
