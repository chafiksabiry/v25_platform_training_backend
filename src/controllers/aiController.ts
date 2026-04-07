import { Request, Response, NextFunction } from 'express';
import gigTrainingGeneratorService from '../services/gigTrainingGeneratorService';

export const generateTrainingFromGig = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { gigId } = req.params;
    if (!gigId) {
      return res.status(400).json({ error: 'gigId is required' });
    }

    const journey = await gigTrainingGeneratorService.generateTrainingFromGig(gigId);
    
    return res.status(201).json({
      message: 'Training journey generated successfully',
      journeyId: journey._id,
      journey
    });
  } catch (error) {
    return next(error);
  }
};
