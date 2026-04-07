import { Request, Response, NextFunction } from 'express';
import gigTrainingGeneratorService from '../services/gigTrainingGeneratorService';
import documentAnalysisService from '../services/documentAnalysisService';
import cloudinaryService from '../services/cloudinaryService';
import { AppError } from '../middleware/errorHandler';
import fs from 'fs';
import { promisify } from 'util';

const unlinkAsync = promisify(fs.unlink);

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

export const analyzeDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const analysis = await documentAnalysisService.analyzeDocument(
      req.file.path,
      req.file.mimetype
    );

    // Upload to Cloudinary
    let fileUrl = '';
    try {
      const uploadResult = await cloudinaryService.uploadDocument(req.file, 'training-content');
      fileUrl = uploadResult.url;
    } catch (uploadError) {
      console.error('Cloudinary upload error:', uploadError);
      // Optional: don't fail the whole process if upload fails, just keep analysis
    }

    // Cleanup local file
    try {
      await unlinkAsync(req.file.path);
    } catch (unlinkError) {
      console.error('Error deleting local file:', unlinkError);
    }

    return res.status(200).json({
      success: true,
      data: {
        ...analysis,
        fileUrl
      }
    });
  } catch (error) {
    return next(error);
  }
};

export const generateProgramFromAnalysis = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { analysis } = req.body;
    if (!analysis) {
      return res.status(400).json({ error: 'Analysis data is required' });
    }

    const program = await documentAnalysisService.generateTrainingProgram(analysis);
    const presentation = await documentAnalysisService.generatePresentation(program);

    return res.status(200).json({
      success: true,
      data: {
        program,
        presentation
      }
    });
  } catch (error) {
    return next(error);
  }
};
