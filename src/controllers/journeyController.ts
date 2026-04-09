import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import trainingJourneyService from '../services/trainingJourneyService';
import { asyncHandler } from '../middleware/errorHandler';
import cloudinaryService from '../services/cloudinaryService';

export const createJourney = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { presentationData, ...journeyData } = req.body;
  
  if (presentationData) {
    try {
      const fileName = `presentation_${Date.now()}`;
      const uploadResult = await cloudinaryService.uploadJsonData(presentationData, fileName);
      journeyData.presentationUrl = uploadResult.url;
    } catch (error) {
      console.error('Failed to upload presentation to Cloudinary:', error);
    }
    // Assurer la persistance du style de la présentation IA dans la base de données
    journeyData.presentation = presentationData;
  }

  const journey = await trainingJourneyService.saveJourney(journeyData);
  res.status(201).json({
    success: true,
    journey
  });
});

export const updateJourney = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { presentationData, ...journeyData } = req.body;
  
  if (presentationData) {
    try {
      const fileName = `presentation_${Date.now()}`;
      const uploadResult = await cloudinaryService.uploadJsonData(presentationData, fileName);
      journeyData.presentationUrl = uploadResult.url;
    } catch (error) {
      console.error('Failed to upload presentation to Cloudinary:', error);
    }
    // Assurer la persistance du style de la présentation IA dans la base de données
    journeyData.presentation = presentationData;
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
