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

  res.status(200).json({
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
