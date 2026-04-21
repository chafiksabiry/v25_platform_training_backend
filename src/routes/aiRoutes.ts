import { Router } from 'express';
import * as aiController from '../controllers/aiController';
import upload from '../middleware/upload';

const router = Router();

router.post(
  '/generate-training/:gigId',
  aiController.generateTrainingFromGig
);

router.get(
  '/gig/:gigId/knowledge-documents',
  aiController.listGigKnowledgeDocuments
);

router.get(
  '/gig/:gigId/call-recordings',
  aiController.listGigCallRecordings
);

router.post(
  '/chat',
  aiController.chat
);

router.post(
  '/generate-podcast-script',
  aiController.generatePodcastScript
);

router.post(
  '/podcast/chat',
  aiController.podcastChat
);

router.post(
  '/podcast/save',
  aiController.savePodcast
);

router.get(
  '/podcast/list',
  aiController.listSavedPodcasts
);

router.post(
  '/chat/title',
  aiController.generateChatTitle
);

router.get(
  '/chat/history',
  aiController.listChatHistory
);

router.get(
  '/chat/history/:sessionId',
  aiController.getChatSession
);

router.post(
  '/analyze-document',
  upload.single('file'),
  aiController.analyzeDocument
);

router.post(
  '/generate-program',
  aiController.generateProgramFromAnalysis
);

router.post(
  '/generate-curriculum',
  aiController.generateProgramFromAnalysis
);

router.post(
  '/generate-presentation',
  aiController.generatePresentation
);

router.post(
  '/edit-slide',
  aiController.editSlide
);

router.post(
  '/synthesize-programs',
  aiController.synthesizePrograms
);

router.post(
  '/export-pptx',
  aiController.exportToPPTX
);

router.post(
  '/export-pptx-python',
  aiController.exportToPPTXPython
);

export default router;
