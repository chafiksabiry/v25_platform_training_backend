import { Request, Response, NextFunction } from 'express';
import gigTrainingGeneratorService from '../services/gigTrainingGeneratorService';
import documentAnalysisService from '../services/documentAnalysisService';
import aiService from '../services/aiService';
import { generatePPTX } from '../services/pptxExportService';
import { PythonPPTService } from '../services/pythonPPTService';
import cloudinaryService from '../services/cloudinaryService';
import { AppError } from '../middleware/errorHandler';
import Document from '../models/Document';
import mongoose from 'mongoose';
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

    const useKnowledgeBase =
      req.body == null || typeof req.body !== 'object'
        ? true
        : (req.body as { useKnowledgeBase?: boolean }).useKnowledgeBase !== false;
    const includeCallRecordings =
      req.body != null &&
      typeof req.body === 'object' &&
      (req.body as { includeCallRecordings?: boolean }).includeCallRecordings === true;
    const sourceContext =
      req.body != null && typeof req.body === 'object'
        ? (req.body as { sourceContext?: unknown }).sourceContext
        : undefined;

    const anthropicKey = req.headers['x-anthropic-key'] as string;
    const journey = await gigTrainingGeneratorService.generateTrainingFromGig(gigId, anthropicKey, {
      useKnowledgeBase,
      includeCallRecordings,
      sourceContext
    });

    return res.status(201).json({
      message: 'Training journey generated successfully',
      journeyId: journey._id,
      journey,
      useKnowledgeBase
    });
  } catch (error) {
    return next(error);
  }
};

/** Liste les documents KB rattachés à un Gig (métadonnées + résumé court). */
export const listGigKnowledgeDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { gigId } = req.params;
    if (!gigId) {
      return res.status(400).json({ success: false, error: 'gigId is required' });
    }

    const docs = await Document.find({ gigId })
      .sort({ createdAt: -1 })
      .select('name fileType description createdAt analysis.summary analysis.keyTerms gigId')
      .lean();

    // One logical KB file can exist as multiple Mongo rows (re-uploads, retries, legacy sync).
    // Prefer one row per display filename: same name + different cloudinaryPublicId still counts as one file for the UI.
    const normalizeBasename = (n: string) => {
      const s = String(n || '').trim().toLowerCase();
      const base = s.split(/[/\\]/).pop() || s;
      return base;
    };

    const byKey = new Map<string, any>();
    for (const d of docs) {
      const key = `name:${normalizeBasename(d.name)}`;
      if (!byKey.has(key)) byKey.set(key, d);
    }

    const documents = Array.from(byKey.values()).map((d: any) => ({
      _id: String(d._id),
      name: d.name,
      fileType: d.fileType,
      description: d.description,
      createdAt: d.createdAt,
      summary: d.analysis?.summary,
      keyTerms: d.analysis?.keyTerms
    }));

    return res.json({ success: true, documents });
  } catch (error) {
    return next(error);
  }
};

/** Liste les call recordings rattachés à un Gig. */
export const listGigCallRecordings = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { gigId } = req.params;
    if (!gigId) {
      return res.status(400).json({ success: false, error: 'gigId is required' });
    }

    const callRecordingsCollection = mongoose.connection.collection('callrecordings');
    const objectIdFilter = mongoose.Types.ObjectId.isValid(gigId)
      ? [{ gigId: new mongoose.Types.ObjectId(gigId) }]
      : [];

    const recordings = await callRecordingsCollection
      .find({
        $or: [
          ...objectIdFilter,
          { gigId },
        ],
      })
      .sort({ createdAt: -1 })
      .toArray();

    return res.json({
      success: true,
      callRecordings: recordings.map((rec: any) => ({
        _id: String(rec._id),
        recordingUrl: rec.recordingUrl,
        duration: rec.duration,
        analysis: rec.analysis,
        transcription: rec.transcription,
        summary: rec.summary || rec.analysis?.summaryText || '',
        createdAt: rec.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Chat endpoint used by frontend Claude-like conversation UI.
 */
export const chat = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { message, context } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const anthropicKey = req.headers['x-anthropic-key'] as string;
    const safeContext =
      typeof context === 'string' && context.trim().length > 0
        ? context.trim()
        : 'No additional context provided.';

    const prompt = [
      'HARX conversation context:',
      safeContext,
      '',
      'User message:',
      message.trim()
    ].join('\n');

    const systemPrompt = [
      'You are HARX AI assistant powered by Claude.',
      'Reply in the same language as the user (French when user writes French).',
      'Use clean, readable formatting: short paragraphs and bullet lists when useful.',
      'IMPORTANT: Avoid huge markdown titles (#, ##). Prefer plain text or compact section labels.',
      'Do not output decorative separators.',
      'When relevant, guide the user to specify training goals, audience, duration, and constraints.'
    ].join(' ');

    const response = await aiService.generateWithClaude(
      prompt,
      systemPrompt,
      anthropicKey
    );

    return res.status(200).json({
      success: true,
      response: String(response || '').trim()
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

    const anthropicKey = req.headers['x-anthropic-key'] as string;
    const { gigId, companyId } = req.body || {};

    const analysis = await documentAnalysisService.analyzeDocument(
      req.file.path,
      req.file.mimetype,
      anthropicKey
    );

    // Upload to Cloudinary
    let fileUrl = '';
    let cloudinaryPublicId = '';
    try {
      if (req.file) {
        const uploadResult = await cloudinaryService.uploadDocument(req.file, 'training-content');
        fileUrl = uploadResult.url;
        cloudinaryPublicId = uploadResult.publicId || '';
      }
    } catch (uploadError: any) {
      if (uploadError.http_code === 401) {
        console.warn('⚠️ Cloudinary: Account disabled or invalid credentials (401). Skipping upload.');
      } else {
        console.error('❌ Cloudinary upload error:', uploadError);
      }
    }

    // Persist analyzed document so KB retrieval by gigId can work.
    // If companyId is missing, we skip persistence to avoid invalid records.
    try {
      const normalizedCompanyId = companyId || '';
      if (normalizedCompanyId) {
        const aiAnalysis = (analysis as any)?.aiAnalysis || {};
        await Document.create({
          name: req.file.originalname,
          description: '',
          fileUrl,
          cloudinaryPublicId,
          fileType: req.file.mimetype,
          content: (analysis as any)?.extractedContent?.text || '',
          tags: [],
          uploadedBy: '',
          companyId: normalizedCompanyId,
          gigId: gigId || undefined,
          isProcessed: true,
          processingStatus: 'completed',
          chunks: [],
          analysis: {
            summary: Array.isArray(aiAnalysis.suggestedLearningObjectives)
              ? aiAnalysis.suggestedLearningObjectives.join(' | ')
              : '',
            domain: '',
            theme: '',
            mainPoints: Array.isArray(aiAnalysis.keyConceptsExtracted)
              ? aiAnalysis.keyConceptsExtracted.slice(0, 10)
              : [],
            technicalLevel: '',
            targetAudience: '',
            keyTerms: Array.isArray(aiAnalysis.keyTopics)
              ? aiAnalysis.keyTopics.slice(0, 15)
              : [],
            recommendations: []
          }
        });
      } else {
        console.warn('⚠️ Skipping document persistence: missing companyId');
      }
    } catch (persistError) {
      console.error('❌ Failed to persist analyzed document:', persistError);
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

    const anthropicKey = req.headers['x-anthropic-key'] as string;

    const program = await documentAnalysisService.generateTrainingProgram(analysis, anthropicKey);
    const presentation = await documentAnalysisService.generatePresentation(program, anthropicKey);

    const parseDuration = (val: any): number => {
      if (typeof val === 'number') return val;
      if (!val) return 120;
      const str = String(val).toLowerCase();
      if (str.includes('h')) {
        const hours = parseFloat(str) || 2;
        return hours * 60;
      }
      return parseFloat(str) || 120;
    };

    const modules = (program.modules || []).map((m: any) => ({
      ...m,
      duration: parseDuration(m.duration),
      difficulty: m.difficulty || 'intermediate'
    }));

    return res.status(200).json({
      success: true,
      title: program.title || 'Formation Générée par IA',
      description: program.description || 'Description du programme',
      totalDuration: parseDuration(program.duration || program.totalDuration),
      methodology: program.methodology || 'Interactive',
      modules: modules,
      data: {
        program,
        presentation
      }
    });
  } catch (error) {
    return next(error);
  }
};

export const generatePresentation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { curriculum, gigId, useKnowledgeBase, includeCallRecordings, sourceContext, sourceMode } = req.body || {};
    if (!curriculum) {
      return res.status(400).json({ error: 'Curriculum data is required' });
    }

    const anthropicKey = req.headers['x-anthropic-key'] as string;
    const presentation = await documentAnalysisService.generatePresentation(curriculum, anthropicKey, {
      gigId: gigId != null && gigId !== '' ? String(gigId) : undefined,
      useKnowledgeBase: useKnowledgeBase === true,
      includeCallRecordings: includeCallRecordings === true,
      sourceContext: sourceContext || undefined,
      sourceMode: sourceMode || undefined
    });

    return res.status(200).json({
      success: true,
      presentation
    });
  } catch (error) {
    return next(error);
  }
};

export const editSlide = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { slide, prompt } = req.body;
    if (!slide || !prompt) {
      return res.status(400).json({ error: 'Slide data and prompt are required' });
    }

    const anthropicKey = req.headers['x-anthropic-key'] as string;
    const updatedSlide = await documentAnalysisService.editSlide(slide, prompt, anthropicKey);

    return res.status(200).json({
      success: true,
      slide: updatedSlide
    });
  } catch (error) {
    return next(error);
  }
};

export const synthesizePrograms = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { analyses } = req.body;
    if (!analyses || !Array.isArray(analyses) || analyses.length === 0) {
      return res.status(400).json({ error: 'At least one analysis is required for synthesis' });
    }

    const anthropicKey = req.headers['x-anthropic-key'] as string;

    // Phase 1: Synthesize all analyses into one unified analysis
    const unifiedAnalysis = await documentAnalysisService.synthesizeMultipleAnalyses(analyses, anthropicKey);
    
    // Phase 2: Generate program and presentation from synthesized context
    const program = await documentAnalysisService.generateTrainingProgram(unifiedAnalysis, anthropicKey);
    const presentation = await documentAnalysisService.generatePresentation(program, anthropicKey);

    const parseDuration = (val: any): number => {
      if (typeof val === 'number') return val;
      if (!val) return 120;
      const str = String(val).toLowerCase();
      if (str.includes('h')) {
        const hours = parseFloat(str) || 2;
        return hours * 60;
      }
      return parseFloat(str) || 120;
    };

    const modules = (program.modules || []).map((m: any) => ({
      ...m,
      duration: parseDuration(m.duration),
      difficulty: m.difficulty || 'intermediate'
    }));

    return res.status(200).json({
      success: true,
      title: program.title || 'Formation Générée par IA',
      description: program.description || 'Description du programme',
      totalDuration: parseDuration(program.duration || program.totalDuration),
      methodology: program.methodology || 'Interactive',
      modules: modules,
      data: {
        program,
        presentation,
        unifiedAnalysis
      }
    });
  } catch (error) {
    return next(error);
  }
};

export const exportToPPTX = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { presentation } = req.body;
    if (!presentation) {
      return res.status(400).json({ error: 'Presentation data is required' });
    }

    const buffer = await generatePPTX(presentation);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(presentation.title || 'presentation')}.pptx"`
    );

    return res.status(200).send(buffer);
  } catch (error) {
    return next(error);
  }
};

export const exportToPPTXPython = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { presentation } = req.body;
    if (!presentation) {
      return res.status(400).json({ error: 'Presentation data is required' });
    }

    console.log('[AIController] Starting Python-based PPTX generation...');
    const buffer = await PythonPPTService.generateWithPython(presentation);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(presentation.title || 'presentation')}_premium.pptx"`
    );

    return res.status(200).send(buffer);
  } catch (error) {
    console.error('[AIController] Python PPTX error:', error);
    return next(error);
  }
};
