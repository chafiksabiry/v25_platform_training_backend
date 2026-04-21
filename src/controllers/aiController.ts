import { Request, Response, NextFunction } from 'express';
import gigTrainingGeneratorService from '../services/gigTrainingGeneratorService';
import documentAnalysisService from '../services/documentAnalysisService';
import aiService from '../services/aiService';
import { generatePPTX } from '../services/pptxExportService';
import { PythonPPTService } from '../services/pythonPPTService';
import cloudinaryService from '../services/cloudinaryService';
import { AppError } from '../middleware/errorHandler';
import Document from '../models/Document';
import Gig from '../models/Gig';
import TrainingChatSession from '../models/TrainingChatSession';
import TrainingPodcast from '../models/TrainingPodcast';
import TrainingVideo from '../models/TrainingVideo';
import TrainingImageSet from '../models/TrainingImageSet';
import mongoose from 'mongoose';
import fs from 'fs';
import { promisify } from 'util';
import crypto from 'crypto';
import { GoogleAuth } from 'google-auth-library';
import { ImageGenerationService } from '../services/imageGenerationService';

const unlinkAsync = promisify(fs.unlink);
const HARX_STYLE_TAG_REGEX = /<harx-style>\s*\{[\s\S]*?\}\s*<\/harx-style>/i;
const HARX_TRAINING_STATUS_REGEX = /<harx-training-status>\s*([\s\S]*?)\s*<\/harx-training-status>/i;

const isJourneyBuilderApp = (parsed: any): boolean => String(parsed?.app || '').trim() === 'HARX Journey Builder';

const stripStyleTagsForReadiness = (raw: string): string =>
  String(raw || '')
    .replace(/<harx-style>[\s\S]*?<\/harx-style>/gi, '')
    .replace(HARX_TRAINING_STATUS_REGEX, '')
    .trim();

/**
 * Second pass (Claude): decide if the training reply is ready to validate, incomplete, or N/A.
 * Appends <harx-training-status>{...}</harx-training-status> for the Journey Builder UI (actions outside the composer).
 */
const appendTrainingReadinessBlock = async (params: {
  assistantMessage: string;
  userMessage: string;
  parsedContext: any;
  anthropicKey?: string;
}): Promise<string> => {
  const { assistantMessage, userMessage, parsedContext, anthropicKey } = params;
  if (!isJourneyBuilderApp(parsedContext)) return '';

  const compactAssistant = stripStyleTagsForReadiness(assistantMessage).slice(-14000);
  if (!compactAssistant || compactAssistant.length < 80) return '';

  const outline = Array.isArray(parsedContext?.curriculumOutline) ? parsedContext.curriculumOutline : [];

  const prompt = [
    'Analyse la derniere reponse assistant pour un parcours de formation HARX (Journey Builder).',
    'Decide si le programme / plan est assez complet pour validation (modules avec contenu pedagogique concret).',
    'Si des modules manquent encore de contenu (titre seul, todo, a completer, ou non traites), liste-les par titre.',
    '',
    `Message utilisateur le plus recent: ${String(userMessage || '').trim()}`,
    '',
    'Modules prevus / etat connu (JSON, peut etre vide):',
    JSON.stringify(outline).slice(0, 8000),
    '',
    'Reponse assistant (extrait pertinent):',
    compactAssistant,
    '',
    'Retourne UNIQUEMENT un JSON valide de forme:',
    '{"readiness":"ready|incomplete|not_applicable","missingModules":[{"title":"","reason":""}],"messageFr":""}',
    'readiness:',
    '- ready: contenu suffisant pour valider / enregistrer la formation.',
    '- incomplete: au moins un module important manque de contenu substantiel.',
    '- not_applicable: pas de plan de formation clair dans cette reponse (banalites, questions seules, hors sujet).',
    'REGLE ABSOLUE: si missingModules contient au moins un module, readiness DOIT etre incomplete (jamais ready). ready implique missingModules vide [].',
    'messageFr: phrase courte en francais pour l utilisateur (ex: ce qui manque).',
  ].join('\n');

  const systemPrompt = [
    'Tu es un controleur qualite pedagogique HARX.',
    'Reponds en JSON strict uniquement, sans markdown ni code fence.',
  ].join(' ');

  let raw = '';
  try {
    raw = await aiService.generateWithClaude(prompt, systemPrompt, anthropicKey, 640, {
      temperature: 0.12,
      preferredModels: ['claude-sonnet-4-5'],
    });
  } catch (e) {
    console.warn('[chat] training readiness inference failed:', e);
    return '';
  }

  let data: any;
  try {
    data = aiService.parseJson(String(raw || ''), 'trainingReadiness');
  } catch {
    console.warn('[chat] training readiness JSON parse failed');
    return '';
  }

  const readinessRaw = String(data?.readiness || '').trim();
  let readiness: 'ready' | 'incomplete' | 'not_applicable' =
    readinessRaw === 'ready' || readinessRaw === 'incomplete' || readinessRaw === 'not_applicable'
      ? (readinessRaw as 'ready' | 'incomplete' | 'not_applicable')
      : 'not_applicable';

  const missingModules = Array.isArray(data?.missingModules)
    ? (data.missingModules as any[])
        .filter((m) => m && String(m.title || '').trim())
        .map((m) => ({
          title: String(m.title).trim(),
          reason: m.reason ? String(m.reason).trim() : undefined,
        }))
        .slice(0, 16)
    : [];

  /** Jamais « ready » tant qu’un module est listé comme incomplet (évite bouton Valider fantôme). */
  if (readiness === 'ready' && missingModules.length > 0) {
    readiness = 'incomplete';
  }

  let messageFr =
    String(data?.messageFr || '').trim() ||
    (readiness === 'ready'
      ? 'La formation semble prête. Vous pouvez la valider pour l’enregistrer.'
      : readiness === 'incomplete' && missingModules.length > 0
        ? `Il manque encore du contenu pour ${missingModules.length} module(s).`
        : '');

  if (readiness === 'incomplete' && missingModules.length > 0 && !messageFr) {
    messageFr = `Il manque encore du contenu pour ${missingModules.length} module(s).`;
  }

  if (readiness === 'not_applicable') return '';

  const actions: { id: string; label: string }[] = [];
  if (readiness === 'ready' && missingModules.length === 0) {
    actions.push({ id: 'validate_training', label: 'Valider la formation' });
  } else if (readiness === 'incomplete' && missingModules.length > 0) {
    actions.push({
      id: 'save_without_missing',
      label: `Enregistrer sans ces ${missingModules.length} module(s)`,
    });
    actions.push({
      id: 'generate_missing_modules',
      label: 'Générer le contenu des modules manquants',
    });
  }

  if (actions.length === 0) return '';

  const payload = { readiness, missingModules, messageFr, actions };
  return `\n\n<harx-training-status>${JSON.stringify(payload)}</harx-training-status>`;
};

const toObjectIdOrUndefined = (value: unknown): mongoose.Types.ObjectId | undefined => {
  if (!value) return undefined;
  const raw = String(value).trim();
  if (!raw || !mongoose.Types.ObjectId.isValid(raw)) return undefined;
  return new mongoose.Types.ObjectId(raw);
};

/** Enrichit le chat avec la fiche gig (snapshot JSON + champs persistés formation) pour ancrer plans / contenus. */
const buildGigGroundingBlocks = async (
  safeGigId: mongoose.Types.ObjectId | undefined,
  parsedContext: any
): Promise<{ promptAppend: string; systemRules: string[] }> => {
  const snap = parsedContext?.gigSnapshot && typeof parsedContext.gigSnapshot === 'object' ? parsedContext.gigSnapshot : null;
  const snapText = snap ? JSON.stringify(snap).slice(0, 12000) : '';
  let dbLines = '';
  if (safeGigId) {
    try {
      const g = await Gig.findById(safeGigId).lean();
      if (g) {
        dbLines =
          `\nGIG (base formation — champs persistés)\n- titre: ${String((g as any).title || '')}\n- description: ${String((g as any).description || '')}\n- industrie: ${String((g as any).industry || '')}\n`;
      }
    } catch {
      /* ignore */
    }
  }
  if (!snapText && !dbLines) return { promptAppend: '', systemRules: [] };
  const promptAppend =
    `\n\n--- ANCRAGE GIG (prioritaire pour plan, modules, contenu pédagogique) ---\n` +
    (snapText ? `Fiche gig (JSON):\n${snapText}\n` : '') +
    dbLines;
  const systemRules = [
    'GIG ANCRAGE: Une fiche GIG est fournie (JSON et/ou base formation). Tout plan, module ou contenu slide-ready DOIT rester aligné sur cette mission (titre, description, industries, activités, secteurs). Ne pas inventer un autre métier ou vertical.',
    'La méthodologie pilote le format pédagogique ; le GIG pilote le domaine métier et le vocabulaire terrain.',
  ];
  return { promptAppend, systemRules };
};

const buildSessionTitle = (seedText: string): string => {
  const normalized = String(seedText || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return 'Nouvelle conversation';
  return normalized.length > 90 ? `${normalized.slice(0, 87)}...` : normalized;
};

const normalizeGeneratedTitle = (rawTitle: string, fallback: string): string => {
  const cleaned = String(rawTitle || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[`*_#>|-]+/g, ' ')
    .replace(/["'“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?;:,]+$/g, '');
  if (!cleaned) return fallback;
  return cleaned.length > 90 ? `${cleaned.slice(0, 87)}...` : cleaned;
};

const stripMarkdownForTts = (raw: string): string =>
  String(raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

const generatePodcastMp3Buffer = async (scriptText: string, language: string): Promise<Buffer> => {
  const apiKey = String(process.env.ELEVENLABS_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY is not configured');
  }

  const voiceId = String(process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM').trim();
  const configuredModel = String(process.env.ELEVENLABS_MODEL || '').trim();
  const fallbackModels = [
    // Prefer modern models first; deprecated v1 models are intentionally excluded.
    'eleven_flash_v2_5',
    'eleven_turbo_v2_5',
    'eleven_multilingual_v2',
  ];
  const modelCandidates = Array.from(
    new Set(
      [configuredModel, ...fallbackModels]
        .map((m) => String(m || '').trim())
        .filter(Boolean)
    )
  );
  const text = stripMarkdownForTts(scriptText).slice(0, 4500);
  if (!text) throw new Error('Script text is empty for TTS generation');

  let lastError = '';
  for (const modelId of modelCandidates) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: language.startsWith('fr') ? 0.45 : 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      lastError = `[${modelId}] ${response.status}: ${errorText.slice(0, 240)}`;
      continue;
    }

    const audioArrayBuffer = await response.arrayBuffer();
    return Buffer.from(audioArrayBuffer);
  }

  const openaiApiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (openaiApiKey) {
    const openAiVoice = String(process.env.OPENAI_TTS_VOICE || 'alloy').trim();
    const openAiModels = ['gpt-4o-mini-tts', 'tts-1'];
    let openAiLastError = '';

    for (const model of openAiModels) {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model,
          voice: openAiVoice,
          format: 'mp3',
          input: text,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        openAiLastError = `[${model}] ${response.status}: ${errorText.slice(0, 240)}`;
        continue;
      }

      const audioArrayBuffer = await response.arrayBuffer();
      return Buffer.from(audioArrayBuffer);
    }

    throw new Error(
      `ElevenLabs failed (${lastError || 'unknown'}), OpenAI TTS fallback failed (${openAiLastError || 'unknown'})`
    );
  }

  throw new Error(`ElevenLabs TTS failed for all model candidates: ${lastError || 'unknown error'}`);
};

type VideoGenerationJobState = {
  id: string;
  provider: 'veo';
  model: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  prompt: string;
  operationName?: string;
  videoUrl?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

const videoGenerationJobs = new Map<string, VideoGenerationJobState>();
const VIDEO_JOB_TIMEOUT_MS = 10 * 60 * 1000;

type TrainingImageGenerationJobState = {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  title: string;
  trainingTitle?: string;
  language: string;
  gigId?: mongoose.Types.ObjectId | string;
  companyId?: mongoose.Types.ObjectId | string;
  sourceDigest: string;
  total: number;
  completed: number;
  items: Array<{
    index: number;
    title: string;
    prompt: string;
    imageUrl: string;
    imageCloudinaryPublicId?: string;
  }>;
  savedImageSetId?: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

const trainingImageGenerationJobs = new Map<string, TrainingImageGenerationJobState>();
const TRAINING_IMAGE_JOB_TIMEOUT_MS = 15 * 60 * 1000;

const normalizeStoryboardRows = (rows: any[], maxImages: number): Array<{ title: string; prompt: string }> => {
  const normalized = (Array.isArray(rows) ? rows : [])
    .map((r: any) => ({
      title: String(r?.title || '').trim(),
      prompt: String(r?.prompt || '').trim(),
      slideRole: String(r?.slideRole || '').trim().toLowerCase(),
    }))
    .filter((r: { title: string; prompt: string; slideRole: string }) => r.title && r.prompt)
    .slice(0, maxImages);
  if (!normalized.length) return [];
  const withFallbackRoles = normalized.map((row: any, idx: number, arr: any[]) => {
    if (idx === 0) return { title: row.title, prompt: row.prompt, slideRole: 'cover' };
    if (idx === 1) return { title: row.title, prompt: row.prompt, slideRole: 'agenda' };
    if (idx === arr.length - 1) return { title: row.title, prompt: row.prompt, slideRole: 'conclusion' };
    if (row.slideRole === 'summary') return { title: row.title, prompt: row.prompt, slideRole: 'summary' };
    return { title: row.title, prompt: row.prompt, slideRole: 'content' };
  });
  return withFallbackRoles.map((row: any) => ({
    title: row.title,
    prompt: `[${row.slideRole.toUpperCase()}] ${row.prompt}`,
  }));
};

const buildDeterministicStoryboardFallback = (params: {
  trainingDigest: string;
  trainingTitle?: string;
  language?: string;
  maxImages: number;
}): Array<{ title: string; prompt: string }> => {
  const lang = String(params.language || 'fr').toLowerCase();
  const isFr = lang.startsWith('fr');
  const digest = String(params.trainingDigest || '');
  const lines = digest.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidateTitles = lines
    .filter((l) => /^(#+\s*)?(module|chapitre|section|slide|partie|topic|theme)\b/i.test(l) || l.length < 90)
    .map((l) => l.replace(/^#+\s*/, '').replace(/^[-•\d.)\s]+/, '').slice(0, 90))
    .filter((v, i, arr) => v.length > 8 && arr.indexOf(v) === i)
    .slice(0, Math.max(params.maxImages - 3, 1));

  const total = Math.max(3, params.maxImages);
  const middleCount = Math.max(total - 3, 1);
  const middleTitles = Array.from({ length: middleCount }).map((_, i) => {
    const picked = candidateTitles[i];
    if (picked) return picked;
    return isFr ? `Contenu ${i + 1}` : `Content ${i + 1}`;
  });

  const titleBase = String(params.trainingTitle || (isFr ? 'Formation' : 'Training'));
  const out: Array<{ title: string; prompt: string }> = [];
  out.push({
    title: isFr ? `${titleBase} - Couverture` : `${titleBase} - Cover`,
    prompt:
      `[COVER] ${titleBase}. Slide de garde de formation, style PowerPoint professionnel, ` +
      'grand titre visible, zone de sous-titre, fond clair avec accents bleus, mise en page éducative.',
  });
  out.push({
    title: isFr ? 'Plan de formation' : 'Training agenda',
    prompt:
      `[AGENDA] Sommaire de la formation ${titleBase}, slide type agenda avec liste des sections, ` +
      'titre "Sommaire", blocs horizontaux lisibles, design cours/formation.',
  });
  middleTitles.forEach((t, i) => {
    out.push({
      title: t,
      prompt:
        `[CONTENT] Slide de contenu "${t}" pour ${titleBase}, style présentation pédagogique, ` +
        'titre en haut, paragraphes/bullets lisibles, schéma simple (boîtes/flèches), mise en page structurée.',
    });
    if (i + 3 >= total - 1) return;
  });
  out.push({
    title: isFr ? 'Conclusion' : 'Conclusion',
    prompt:
      `[CONCLUSION] Slide de conclusion pour ${titleBase}, synthèse visuelle avec points clés, ` +
      'style citation/récapitulatif final, design PowerPoint formation.',
  });
  return out.slice(0, total);
};

const buildImageStoryboardFromDigest = async (params: {
  trainingDigest: string;
  trainingTitle?: string;
  language?: string;
  maxImages?: number;
  styleGuidance?: string;
}): Promise<Array<{ title: string; prompt: string }>> => {
  const maxImages = Math.min(Math.max(Number(params.maxImages || 8), 1), 20);
  const prompt = [
    `Create a storyboard for a training journey as exactly ${maxImages} slide-ready visuals.`,
    'Return strict JSON only with shape: {"images":[{"title":"","prompt":"","slideRole":""}]}',
    'slideRole must be one of: cover, agenda, content, summary, conclusion.',
    'Structure rules:',
    '- Image 1 must be cover.',
    '- Image 2 must be agenda (plan overview).',
    '- Last image must be conclusion.',
    '- Middle images must be content and summary visuals that follow the training progression.',
    '- Content visuals must represent concrete concepts from the training digest (modules, process, tools, cases).',
    'Visual requirements:',
    '- The visuals must look like real training slides (PowerPoint style), not random stock photos.',
    '- Include layout instructions in prompts: title area, content text blocks, bullet zones, footer area.',
    '- Prefer educational slide templates: light background, blue accents, clean typography, simple diagrams/icons.',
    '- Agenda slide must clearly request a "Sommaire" style layout with listed sections.',
    '- Content slides must request text-friendly composition (paragraphs, bullets, process blocks).',
    '- Conclusion slide must request recap/citation style ending.',
    '- Realistic corporate learning context, no logos/watermarks.',
    `Language for title text: ${String(params.language || 'fr')}`,
    `Training title: ${String(params.trainingTitle || 'Training')}`,
    `Optional style guidance from user: ${String(params.styleGuidance || '').slice(0, 800) || 'none'}`,
    'Training digest/context:',
    String(params.trainingDigest || '').slice(0, 12000),
  ].join('\n');
  try {
    const raw = await aiService.generateWithClaude(
      prompt,
      'You are an instructional visual designer. Return JSON only.',
      String(process.env.ANTHROPIC_API_KEY || '').trim() || undefined,
      1000,
      { temperature: 0.35, preferredModels: [String(process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5')] }
    );
    const parsed = aiService.parseJson(String(raw || ''), 'trainingImageStoryboard', { suppressLogs: true });
    const normalized = normalizeStoryboardRows(parsed?.images, maxImages);
    if (normalized.length > 0) return normalized;
    console.log('[AI] Storyboard returned empty/invalid rows; using deterministic fallback.');
    return buildDeterministicStoryboardFallback({
      trainingDigest: params.trainingDigest,
      trainingTitle: params.trainingTitle,
      language: params.language,
      maxImages,
    });
  } catch {
    console.log('[AI] Storyboard JSON parsing failed; using deterministic fallback.');
    return buildDeterministicStoryboardFallback({
      trainingDigest: params.trainingDigest,
      trainingTitle: params.trainingTitle,
      language: params.language,
      maxImages,
    });
  }
};

const processTrainingImageJob = async (
  jobId: string,
  storyboard: Array<{ title: string; prompt: string }>
): Promise<void> => {
  const state = trainingImageGenerationJobs.get(jobId);
  if (!state) return;
  state.status = 'running';
  state.updatedAt = Date.now();
  trainingImageGenerationJobs.set(jobId, state);
  try {
    let imageSetId = state.savedImageSetId ? toObjectIdOrUndefined(state.savedImageSetId) : undefined;
    if (!imageSetId) {
      const created = await TrainingImageSet.create({
        gigId: state.gigId,
        companyId: state.companyId,
        title: state.title,
        trainingTitle: state.trainingTitle || undefined,
        language: state.language,
        sourceDigest: state.sourceDigest.slice(0, 40000),
        items: [],
      });
      imageSetId = created._id;
      state.savedImageSetId = String(created._id);
      state.updatedAt = Date.now();
      trainingImageGenerationJobs.set(jobId, state);
    }

    for (let i = 0; i < storyboard.length; i += 1) {
      const scene = storyboard[i];
      const imgBuffer = await ImageGenerationService.generateImageBuffer(scene.prompt);
      const uploaded = await cloudinaryService.uploadImageBuffer(imgBuffer, 'training-images/generated');
      const nextItem = {
        index: i + 1,
        title: scene.title,
        prompt: scene.prompt,
        imageUrl: uploaded.url,
        imageCloudinaryPublicId: uploaded.publicId,
      };
      state.items.push(nextItem);
      if (imageSetId) {
        await TrainingImageSet.updateOne(
          { _id: imageSetId },
          {
            $push: { items: nextItem },
            $set: { updatedAt: new Date() },
          }
        );
      }
      state.completed = state.items.length;
      state.updatedAt = Date.now();
      trainingImageGenerationJobs.set(jobId, state);
    }
    state.status = 'completed';
    state.updatedAt = Date.now();
    trainingImageGenerationJobs.set(jobId, state);
  } catch (e: any) {
    state.status = 'failed';
    state.error = String(e?.message || 'Image generation failed');
    state.updatedAt = Date.now();
    trainingImageGenerationJobs.set(jobId, state);
  }
};

type GoogleServiceAccountLike = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

const parseGoogleServiceAccountFromEnv = (): GoogleServiceAccountLike | null => {
  const raw = String(
    process.env.VERTEX_AI_CREDENTIALS ||
      process.env.CLOUD_STORAGE_CREDENTIALS ||
      ''
  ).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as GoogleServiceAccountLike;
  } catch {
    return null;
  }
};

const getGoogleCloudAuthToken = async (): Promise<string> => {
  const creds = parseGoogleServiceAccountFromEnv();
  const auth = new GoogleAuth({
    credentials: creds || undefined,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const token = await auth.getAccessToken();
  if (!token) throw new Error('Unable to acquire Google Cloud access token');
  return token;
};

const extractFirstVideoUrl = (payload: any): string | undefined => {
  const queue: any[] = [payload];
  const seen = new Set<any>();
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string') {
        const low = v.toLowerCase();
        if (low.startsWith('https://') && (low.includes('.mp4') || low.includes('.webm') || /video/.test(k.toLowerCase()))) {
          return v;
        }
      } else if (v && typeof v === 'object') {
        queue.push(v);
      }
    }
  }
  return undefined;
};

const triggerVeoGeneration = async (params: {
  prompt: string;
  aspectRatio?: string;
  durationSeconds?: number;
}): Promise<{ operationName: string; model: string }> => {
  const apiKey = String(process.env.GOOGLE_GENAI_API_KEY || '').trim();
  const model = String(
    process.env.VERTEX_AI_MODEL ||
      process.env.VEO_MODEL ||
      'veo-2.0-generate-001'
  ).trim();
  const payload = {
    instances: [{ prompt: params.prompt }],
    parameters: {
      aspectRatio: params.aspectRatio || '16:9',
      durationSeconds: Math.min(Math.max(Number(params.durationSeconds || 8), 4), 12),
    },
  };
  let response: globalThis.Response;
  if (apiKey) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:predictLongRunning?key=${encodeURIComponent(apiKey)}`;
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } else {
    const creds = parseGoogleServiceAccountFromEnv();
    const project = String(
      process.env.VERTEX_AI_PROJECT ||
        process.env.GOOGLE_CLOUD_PROJECT ||
        creds?.project_id ||
        ''
    ).trim();
    const location = String(
      process.env.VERTEX_AI_LOCATION ||
        process.env.GOOGLE_CLOUD_LOCATION ||
        'us-central1'
    ).trim();
    if (!project) {
      throw new Error('GOOGLE_CLOUD_PROJECT is required when GOOGLE_GENAI_API_KEY is not configured');
    }
    const token = await getGoogleCloudAuthToken();
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(
      project
    )}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:predictLongRunning`;
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Veo generation request failed (${response.status}): ${errorText.slice(0, 320)}`);
  }
  const data: any = await response.json().catch(() => ({}));
  const operationName = String(data?.name || '').trim();
  if (!operationName) {
    throw new Error('Veo generation request succeeded but operation id is missing');
  }
  return { operationName, model };
};

const pollVeoOperation = async (operationName: string): Promise<{ done: boolean; videoUrl?: string; error?: string }> => {
  const apiKey = String(process.env.GOOGLE_GENAI_API_KEY || '').trim();
  let response: globalThis.Response;
  if (apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${encodeURIComponent(apiKey)}`;
    response = await fetch(url, { method: 'GET' });
  } else {
    const location = String(
      process.env.VERTEX_AI_LOCATION ||
        process.env.GOOGLE_CLOUD_LOCATION ||
        'us-central1'
    ).trim();
    const token = await getGoogleCloudAuthToken();
    const opPath = String(operationName || '').replace(/^\/+/, '');
    const url = `https://${location}-aiplatform.googleapis.com/v1/${opPath}`;
    response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    return { done: false, error: `Veo status failed (${response.status}): ${errorText.slice(0, 320)}` };
  }
  const data: any = await response.json().catch(() => ({}));
  const done = Boolean(data?.done);
  if (!done) return { done: false };
  if (data?.error?.message) {
    return { done: true, error: String(data.error.message) };
  }
  const videoUrl = extractFirstVideoUrl(data);
  if (!videoUrl) {
    return { done: true, error: 'Veo operation completed but no downloadable video URL was returned.' };
  }
  return { done: true, videoUrl };
};

type ChatTitleMessage = {
  role: 'assistant' | 'user';
  text: string;
};

const isHexColor = (value: unknown): boolean =>
  typeof value === 'string' && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);

const extractStyleJsonFromTag = (rawText: string): any | null => {
  const match = String(rawText || '').match(/<harx-style>([\s\S]*?)<\/harx-style>/i);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
};

const isValidStyleBlueprint = (candidate: any): boolean => {
  if (!candidate || typeof candidate !== 'object') return false;
  if (!Array.isArray(candidate.moduleCardThemes) || candidate.moduleCardThemes.length < 1) return false;
  if (!isHexColor(candidate.titleColor) || !isHexColor(candidate.accentColor)) return false;
  if (!candidate.contentTheme || typeof candidate.contentTheme !== 'object') return false;

  const validTheme = candidate.moduleCardThemes.every(
    (theme: any) => isHexColor(theme?.bg) && isHexColor(theme?.border) && (!theme?.text || isHexColor(theme?.text))
  );
  if (!validTheme) return false;

  const ct = candidate.contentTheme;
  const requiredHexFields = [
    'bodyColor',
    'headingColor',
    'tableBorder',
    'tableHeaderBg',
    'tableHeaderText',
    'tableRowBg',
    'kpiBg',
    'kpiBorder',
    'kpiLabel',
    'kpiValue',
    'panelBg',
    'panelBorder',
    'badgeBg',
    'badgeText',
  ];
  if (!requiredHexFields.every((field) => isHexColor(ct?.[field]))) return false;
  if (!['rounded', 'square', 'soft'].includes(String(ct?.moduleShape || ''))) return false;

  return true;
};

const generateStyleBlueprintWithClaude = async (
  contentText: string,
  selectedDuration: string,
  selectedMethodology: string,
  anthropicKey: string
): Promise<any | null> => {
  try {
    const stylePrompt = [
      'Generate ONLY a JSON object (no markdown, no code fence, no extra text).',
      'The JSON must match this shape exactly:',
      '{"moduleCardThemes":[{"bg":"#hex","border":"#hex","text":"#hex"}],"titleColor":"#hex","accentColor":"#hex","contentTheme":{"bodyColor":"#hex","headingColor":"#hex","tableBorder":"#hex","tableHeaderBg":"#hex","tableHeaderText":"#hex","tableRowBg":"#hex","kpiBg":"#hex","kpiBorder":"#hex","kpiLabel":"#hex","kpiValue":"#hex","moduleShape":"rounded|square|soft","panelBg":"#hex","panelBorder":"#hex","badgeBg":"#hex","badgeText":"#hex"}}',
      'Create a fresh non-repetitive visual identity for this specific training content.',
      `Target duration: ${selectedDuration}.`,
      `Methodology: ${selectedMethodology}.`,
      'Content to style:',
      String(contentText || '').slice(0, 5000),
    ].join('\n');

    const styleSystem = [
      'You are a strict JSON style generator for HARX training cards.',
      'Output valid JSON only.',
      'Use coherent, readable, professional palettes.',
      'Do not output explanations.',
    ].join(' ');

    const raw = await aiService.generateWithClaude(stylePrompt, styleSystem, anthropicKey);
    const normalized = String(raw || '')
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const parsed = extractStyleJsonFromTag(normalized) || JSON.parse(normalized);
    return isValidStyleBlueprint(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const ensureVisualResponseContract = async (
  rawText: string,
  selectedDuration: string,
  selectedMethodology: string,
  seedText: string,
  anthropicKey: string
): Promise<string> => {
  let text = String(rawText || '').trim();
  if (!text) text = "Je n'ai pas pu generer une reponse pour le moment.";
  text = text.replace(/<harx-html>[\s\S]*?<\/harx-html>/gi, '').trim();

  const lowerSeed = String(seedText || '').toLowerCase();
  const asksStructuredPlan =
    /\b(plan|programme|parcours|curriculum|roadmap|agenda|structure|schema|planning|module|contenu|cours|formation)\b/i.test(lowerSeed);

  // Keep chat spontaneous by default; only enforce visual contracts for clear plan-building requests.
  if (!asksStructuredPlan) {
    return text.replace(HARX_STYLE_TAG_REGEX, '').trim();
  }

  // Ne plus injecter de tableau « Bloc | Durée | Méthodologie » : ce n’est pas du contenu slide et encombre la présentation.

  const existingStyle = extractStyleJsonFromTag(text);
  let styleBlueprint = isValidStyleBlueprint(existingStyle) ? existingStyle : null;
  if (!styleBlueprint) {
    styleBlueprint = await generateStyleBlueprintWithClaude(
      text,
      selectedDuration,
      selectedMethodology,
      anthropicKey
    );
  }
  if (styleBlueprint) {
    text = text.replace(/<harx-style>[\s\S]*?<\/harx-style>/gi, '').trim();
    text += [
      '',
      `<harx-style>${JSON.stringify(styleBlueprint)}</harx-style>`,
    ].join('\n');
  }

  return text.replace(/<harx-style>[\s\S]*?<\/harx-style>/gi, (match) => (styleBlueprint ? match : '')).trim();
};

const inferKbDomainFromContext = (parsedContext: any): {
  kbFocusLabel: string;
  kbKeywords: string[];
  strictTopicGuard: string;
} => {
  const docs = Array.isArray(parsedContext?.knowledgeBaseDocuments)
    ? parsedContext.knowledgeBaseDocuments
    : [];

  const kbText = docs
    .map((d: any) =>
      [
        String(d?.name || ''),
        String(d?.summary || ''),
        Array.isArray(d?.keyTerms) ? d.keyTerms.join(' ') : '',
      ].join(' ')
    )
    .join(' ')
    .toLowerCase();

  const stopwords = new Set([
    'avec', 'dans', 'pour', 'sans', 'tout', 'tous', 'toute', 'sur', 'des', 'les', 'une', 'vos', 'votre',
    'from', 'that', 'this', 'then', 'have', 'will', 'into', 'about', 'which', 'dont', 'avec', 'plus',
  ]);
  const keywordCounts = new Map<string, number>();
  const tokens = kbText.match(/[a-zA-ZÀ-ÿ0-9_]{4,}/g) || [];
  for (const tokenRaw of tokens) {
    const token = tokenRaw.toLowerCase();
    if (stopwords.has(token)) continue;
    keywordCounts.set(token, (keywordCounts.get(token) || 0) + 1);
  }
  const kbKeywords = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 24)
    .map(([k]) => k);

  if (kbKeywords.length > 0) {
    return {
      kbFocusLabel: kbKeywords.slice(0, 8).join(', '),
      kbKeywords,
      strictTopicGuard:
        'Use ONLY the KB topic. Keep terms, examples, and vocabulary aligned with KB keywords. Do not switch to another domain unless user explicitly asks.',
    };
  }

  return {
    kbFocusLabel: 'No KB keywords detected',
    kbKeywords: [],
    strictTopicGuard:
      'Infer topic from current user message and available KB documents. Never invent a different domain.',
  };
};

const isKbTopicMismatch = (text: string, kbKeywords: string[]): boolean => {
  if (!Array.isArray(kbKeywords) || kbKeywords.length === 0) return false;
  const lower = String(text || '').toLowerCase();
  const hits = kbKeywords.filter((kw) => kw && lower.includes(kw.toLowerCase())).length;
  // If almost no overlap with KB vocabulary, treat as off-topic.
  return hits < 2;
};

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
    const { message, context, gigId, companyId, sessionId } = req.body || {};

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const anthropicKey = req.headers['x-anthropic-key'] as string;
    const safeContext =
      typeof context === 'string' && context.trim().length > 0
        ? context.trim()
        : 'No additional context provided.';
    let parsedContext: any = null;
    try {
      parsedContext = JSON.parse(safeContext);
    } catch {
      parsedContext = null;
    }
    const selectedDuration = parsedContext?.selectedDuration || 'non specifiee';
    const selectedMethodology = parsedContext?.selectedMethodology || 'Methodologie 360';
    const inferredDomain = inferKbDomainFromContext(parsedContext);
    const safeGigId = toObjectIdOrUndefined(gigId);
    const safeCompanyId = toObjectIdOrUndefined(companyId);
    const safeSessionId = toObjectIdOrUndefined(sessionId);

    let activeSession = safeSessionId
      ? await TrainingChatSession.findById(safeSessionId)
      : null;
    if (!activeSession) {
      activeSession = await TrainingChatSession.create({
        gigId: safeGigId,
        companyId: safeCompanyId,
        title: buildSessionTitle(message),
        messages: [],
        lastActivityAt: new Date(),
      });
    }

    const gigGrounding = await buildGigGroundingBlocks(safeGigId, parsedContext);

    const prompt = [
      'HARX conversation context:',
      safeContext,
      gigGrounding.promptAppend,
      '',
      'User message:',
      message.trim()
    ].join('\n');

    const systemPrompt = [
      'You are HARX AI assistant powered by Claude.',
      'Reply in the same language as the user (French when user writes French).',
      'Adopt a spontaneous, natural, human-like conversational style while staying professional.',
      'Mirror user intent and energy: direct when user is direct, exploratory when user brainstorms, concise when user asks briefly.',
      'Do not sound templated. Vary sentence rhythm and transitions naturally.',
      'Use clean, readable formatting: short paragraphs and bullet lists only when they add value.',
      'MARKDOWN (obligatoire pour les plans et contenus de modules) : rédige en Markdown valide — titres avec ## ou ### (éviter un unique titre niveau # qui occupe tout), listes à puces (- ou *), **gras**, *italique*, liens [texte](url) si utile, tableaux markdown seulement pour un vrai contenu pédagogique (pas tableaux admin).',
      'Do not output decorative separator lines (---) sauf si vraiment nécessaire pour séparer deux blocs distincts.',
      'Visual style policy: keep normal chat replies light and conversational.',
      'For training plans, modules, and detailed content, always use structured Markdown optimized for rich styled rendering (headings, bullet points, compact tables when useful).',
      'Never output HTML, CSS, JavaScript, iframe snippets, or <harx-html> tags.',
      `INTERNAL pacing (do not paste verbatim into slide-ready module bodies): methodology ${selectedMethodology}; global target duration ${selectedDuration}.`,
      gigGrounding.systemRules.length
        ? 'IMPORTANT: Methodology shapes pedagogy only; the GIG anchoring block defines the business/topic domain when present.'
        : 'IMPORTANT: Methodology shapes pedagogy only; it must NOT force the business/topic domain.',
      `KB keyword focus: ${inferredDomain.kbFocusLabel}.`,
      inferredDomain.strictTopicGuard,
      'Do not add per-slide or per-module duration labels (e.g. "25 min", "Durée totale", "X minutes") unless the user explicitly asks for a timing breakdown.',
      'Do NOT add reminder banners like "Rappel — Durée cible … | Méthodologie …" or similar meta lines in answers.',
      'SLIDE-READY MODULE CONTENT: when producing content for slides, use Markdown (##/###, listes, paragraphes, **gras**) with ONLY learner-facing pedagogical text. No boilerplate section titled like "## Objectifs pédagogiques" empty or generic, no evaluation grids, no admin recap tables, no methodology/duration reminder lines in that body.',
      'Do NOT include sections about resources/support/materials/equipment (e.g., "Supports et ressources", "Documents fournis", "Équipement nécessaire").',
      'Focus on clear pedagogical ideas learners see on slides; keep pacing implicit unless the user asks for a schedule.',
      'If prior conversation history is off-domain, ignore it and prioritize current user message + KB context.',
      'Prefer useful clarity over rigid templates.',
      ...(gigGrounding.systemRules.length
        ? gigGrounding.systemRules
        : ['Do NOT mention or infer company name, gig name, or gig description unless explicitly provided by user in current message.']),
      'If user asks for a training plan, generate a complete draft plan immediately (modules with substantive slide-ready text, programme-level structure) without waiting for extra clarifications; for parts that become slides, obey SLIDE-READY MODULE CONTENT (no per-module timing banners in slide bodies).',
      'You may finish with 2-4 optional clarification questions, but only after providing the full initial plan.',
      'NEVER include fake UI buttons, markdown button syntax, or "Valider / Enregistrer" controls in your reply; the app shows validation actions separately when appropriate.'
    ].join(' ');

    const streamEnabled = String(req.query.stream ?? 'true').toLowerCase() !== 'false';
    const shouldValidateDomain = inferredDomain.kbKeywords.length > 0;
    if (!streamEnabled) {
      let response = await aiService.generateWithClaude(
        prompt,
        systemPrompt,
        anthropicKey
      );
      if (shouldValidateDomain && isKbTopicMismatch(String(response || ''), inferredDomain.kbKeywords)) {
        const correctiveSystemPrompt = `${systemPrompt} CRITICAL DOMAIN LOCK: ${inferredDomain.strictTopicGuard} If draft is off-domain, regenerate fully in the correct domain.`;
        response = await aiService.generateWithClaude(prompt, correctiveSystemPrompt, anthropicKey);
      }
      let finalResponse = await ensureVisualResponseContract(
        String(response || ''),
        selectedDuration,
        selectedMethodology,
        message.trim(),
        anthropicKey
      );

      const readinessExtra = await appendTrainingReadinessBlock({
        assistantMessage: finalResponse,
        userMessage: message.trim(),
        parsedContext,
        anthropicKey,
      });
      if (readinessExtra) {
        finalResponse = `${finalResponse}${readinessExtra}`;
      }

      const userMessageText = message.trim();
      const assistantMessageText = finalResponse;
      activeSession.messages.push(
        { role: 'user', text: userMessageText, createdAt: new Date() } as any,
        { role: 'assistant', text: assistantMessageText, createdAt: new Date() } as any
      );
      if (!activeSession.title || activeSession.title === 'Nouvelle conversation') {
        activeSession.title = buildSessionTitle(userMessageText);
      }
      activeSession.lastActivityAt = new Date();
      await activeSession.save();

      return res.status(200).json({
        success: true,
        response: assistantMessageText,
        sessionId: String(activeSession._id),
      });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-Chat-Session-Id', String(activeSession._id));
    res.status(200);
    if (typeof (res as any).flushHeaders === 'function') {
      (res as any).flushHeaders();
    }

    let fullResponse = '';
    if (shouldValidateDomain) {
      // For strict domain lock, generate once then stream-safe write validated content.
      let response = await aiService.generateWithClaude(prompt, systemPrompt, anthropicKey);
      if (isKbTopicMismatch(String(response || ''), inferredDomain.kbKeywords)) {
        const correctiveSystemPrompt = `${systemPrompt} CRITICAL DOMAIN LOCK: ${inferredDomain.strictTopicGuard} If draft is off-domain, regenerate fully in the correct domain.`;
        response = await aiService.generateWithClaude(prompt, correctiveSystemPrompt, anthropicKey);
      }
      fullResponse = String(response || '');
      res.write(fullResponse);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } else {
      for await (const chunk of aiService.streamWithClaude(prompt, systemPrompt, anthropicKey)) {
        fullResponse += chunk;
        res.write(chunk);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      }
    }

    const userMessageText = message.trim();
    let assistantMessageText = await ensureVisualResponseContract(
      String(fullResponse || ''),
      selectedDuration,
      selectedMethodology,
      message.trim(),
      anthropicKey
    );
    if (assistantMessageText !== String(fullResponse || '').trim()) {
      const appended = assistantMessageText.slice(String(fullResponse || '').trim().length);
      if (appended) {
        res.write(appended);
        if (typeof (res as any).flush === 'function') {
          (res as any).flush();
        }
      }
    }

    const readinessExtra = await appendTrainingReadinessBlock({
      assistantMessage: assistantMessageText,
      userMessage: userMessageText,
      parsedContext,
      anthropicKey,
    });
    if (readinessExtra) {
      assistantMessageText = `${assistantMessageText}${readinessExtra}`;
      res.write(readinessExtra);
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    }

    activeSession.messages.push(
      { role: 'user', text: userMessageText, createdAt: new Date() } as any,
      { role: 'assistant', text: assistantMessageText, createdAt: new Date() } as any
    );
    if (!activeSession.title || activeSession.title === 'Nouvelle conversation') {
      activeSession.title = buildSessionTitle(userMessageText);
    }
    activeSession.lastActivityAt = new Date();
    await activeSession.save();

    return res.end();
  } catch (error) {
    if (!res.headersSent) return next(error);
    res.write('\n[STREAM_ERROR]');
    return res.end();
  }
};

/**
 * Generates a concise title from chat messages.
 */
export const generateChatTitle = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { messages } = req.body || {};
    const anthropicKey = req.headers['x-anthropic-key'] as string;

    const entries = Array.isArray(messages) ? messages : [];
    const normalizedMessages: ChatTitleMessage[] = entries
      .map((entry: any): ChatTitleMessage => ({
        role: String(entry?.role || '').toLowerCase() === 'assistant' ? 'assistant' : 'user',
        text: String(entry?.text || '').replace(/\s+/g, ' ').trim(),
      }))
      .filter((entry) => entry.text.length > 0)
      .slice(-12);

    const fallbackSeed =
      normalizedMessages.find((entry) => entry.role === 'user')?.text ||
      normalizedMessages[0]?.text ||
      'Slides generees depuis le chat';
    const fallbackTitle = buildSessionTitle(fallbackSeed);

    if (normalizedMessages.length === 0) {
      return res.status(200).json({ success: true, title: fallbackTitle });
    }

    const transcript = normalizedMessages
      .map((entry) => `${entry.role}: ${entry.text}`)
      .join('\n');

    const prompt = [
      'Conversation transcript:',
      transcript,
      '',
      'Task: Generate one short title for this training journey.',
      'Constraints:',
      '- 4 to 9 words',
      '- Keep the business topic of the conversation',
      '- Do not use quotes, markdown, numbering, or punctuation at the end',
      '- Return only the title text',
    ].join('\n');

    const systemPrompt = [
      'You create concise professional training titles in French.',
      'Return plain text only.',
      'Do not output explanations.',
    ].join(' ');

    const rawTitle = await aiService.generateWithClaude(
      prompt,
      systemPrompt,
      anthropicKey,
      120,
      { temperature: 0.2 }
    );

    const title = normalizeGeneratedTitle(rawTitle, fallbackTitle);
    return res.status(200).json({ success: true, title });
  } catch (error) {
    return next(error);
  }
};

/**
 * Returns saved chat sessions linked to a gig.
 */
export const listChatHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const gigId = String(req.query.gigId || '').trim();
    if (!gigId) {
      return res.status(400).json({ success: false, error: 'gigId is required' });
    }

    const safeGigId = toObjectIdOrUndefined(gigId);
    const query = safeGigId
      ? { gigId: safeGigId }
      : { gigId };

    const sessions = await TrainingChatSession.find(query)
      .sort({ lastActivityAt: -1 })
      .limit(40)
      .lean();

    return res.status(200).json({
      success: true,
      sessions: sessions.map((session: any) => {
        const messages = Array.isArray(session.messages) ? session.messages : [];
        const preview = messages.length > 0 ? String(messages[messages.length - 1]?.text || '') : '';
        return {
          _id: String(session._id),
          title: session.title || 'Nouvelle conversation',
          lastActivityAt: session.lastActivityAt || session.updatedAt || session.createdAt,
          messagesCount: messages.length,
          preview: preview.length > 160 ? `${preview.slice(0, 157)}...` : preview,
        };
      }),
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Returns all messages for one saved chat session.
 */
export const getChatSession = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid sessionId' });
    }

    const session = await TrainingChatSession.findById(sessionId).lean();
    if (!session) {
      return res.status(404).json({ success: false, error: 'Chat session not found' });
    }

    return res.status(200).json({
      success: true,
      session: {
        _id: String((session as any)._id),
        title: (session as any).title || 'Nouvelle conversation',
        gigId: (session as any).gigId ? String((session as any).gigId) : null,
        lastActivityAt: (session as any).lastActivityAt || (session as any).updatedAt || (session as any).createdAt,
        messages: ((session as any).messages || []).map((m: any) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          text: String(m.text || ''),
          createdAt: m.createdAt || null,
        })),
      },
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

    // Persist analyzed document in `documents` for KB usage (linked to gigId).
    // If companyId is missing, try resolving it from the provided gig.
    try {
      const normalizedGigId = String(gigId || '').trim();
      let safeCompanyObjectId = toObjectIdOrUndefined(companyId);
      const safeGigObjectId = toObjectIdOrUndefined(normalizedGigId);

      if (!safeCompanyObjectId && safeGigObjectId) {
        const gigRecord = await Gig.findById(normalizedGigId).select('companyId').lean();
        safeCompanyObjectId = toObjectIdOrUndefined((gigRecord as any)?.companyId);
      }

      if (safeCompanyObjectId) {
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
          companyId: safeCompanyObjectId,
          gigId: safeGigObjectId || undefined,
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
        console.warn('⚠️ Skipping document persistence: missing companyId (and no company found via gigId).', {
          gigId: String(gigId || ''),
          fileName: req.file.originalname,
        });
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
    const { analysis, generationPreferences } = req.body;
    if (!analysis) {
      return res.status(400).json({ error: 'Analysis data is required' });
    }

    const anthropicKey = req.headers['x-anthropic-key'] as string;
    const enrichedAnalysis =
      generationPreferences && typeof generationPreferences === 'object'
        ? { ...analysis, generationPreferences }
        : analysis;

    const program = await documentAnalysisService.generateTrainingProgram(enrichedAnalysis, anthropicKey);
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

/**
 * Génère le script oral d’un podcast de formation (texte pour TTS / lecture navigateur).
 * Corps : { trainingDigest: string, trainingTitle?: string, language?: string }
 */
export const generatePodcastScript = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { trainingDigest, trainingTitle, language } = req.body || {};
    const digest = String(trainingDigest || '').trim();
    if (!digest) {
      return res.status(400).json({ success: false, error: 'trainingDigest is required' });
    }
    const title = String(trainingTitle || '').trim() || 'Formation';
    const lang = String(language || 'fr').toLowerCase();
    const anthropicKey = req.headers['x-anthropic-key'] as string | undefined;

    const digestForModel =
      digest.length > 20000 ? `${digest.slice(0, 20000)}\n\n[… contenu tronqué pour limite technique]` : digest;

    const prompt = [`Titre / contexte formation: ${title}`, '', '--- Contenu source (digest) ---', digestForModel].join('\n');

    const systemFr = [
      "Tu rédiges le SCRIPT ORAL d'un seul podcast de formation, en français.",
      'Entrée : le digest ci-dessus (programme, slides, gig, base de connaissances, synthèse conversation).',
      'Sortie : uniquement le texte à lire à voix haute, sans markdown (# ** liste), sans numérotation technique de slides.',
      'Structure : une ligne titre accrocheur, puis introduction courte, puis 3 à 5 chapitres avec titres annoncés oralement, puis conclusion.',
      'Ton : professionnel, chaleureux, clair, phrases relativement courtes.',
      "Durée cible à la lecture : environ 8 à 15 minutes (densité moyenne, pas d'excès de détails techniques).",
      'Ne cite pas "digest" ni "JSON" dans le script.',
    ].join(' ');

    const systemEn = [
      'You write the ORAL SCRIPT for a single training podcast, in English.',
      'Input: the digest above.',
      'Output: only the text to be read aloud, no markdown headings/lists syntax, no slide numbering.',
      'Structure: one catchy title line, short intro, 3–5 chapters with spoken titles, conclusion.',
      'Tone: professional, warm, clear, relatively short sentences.',
      'Target listening length: about 8–15 minutes.',
      'Do not mention "digest" or "JSON" in the script.',
    ].join(' ');

    const script = await aiService.generateWithClaude(
      prompt,
      lang.startsWith('en') ? systemEn : systemFr,
      anthropicKey,
      8192,
      { temperature: 0.42, preferredModels: ['claude-sonnet-4-5'] }
    );

    const trimmed = String(script || '').trim();
    if (!trimmed) {
      return res.status(502).json({ success: false, error: 'Le modèle n’a pas renvoyé de script.' });
    }

    return res.json({ success: true, script: trimmed });
  } catch (error) {
    return next(error);
  }
};

/**
 * Chat dédié podcast: ajuste/raffine le script existant.
 * Corps: { message, currentScript, trainingDigest?, trainingTitle?, language?, history?[] }
 */
export const podcastChat = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      message,
      currentScript,
      trainingDigest,
      trainingTitle,
      language,
      history,
    } = req.body || {};

    const userMessage = String(message || '').trim();
    const script = String(currentScript || '').trim();
    if (!userMessage) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }
    if (!script) {
      return res.status(400).json({ success: false, error: 'currentScript is required' });
    }

    const title = String(trainingTitle || '').trim() || 'Formation';
    const lang = String(language || 'fr').toLowerCase();
    const digest = String(trainingDigest || '').trim();
    const anthropicKey = req.headers['x-anthropic-key'] as string | undefined;
    const safeHistory = Array.isArray(history) ? history.slice(-20) : [];

    const prompt = [
      `Titre / contexte formation: ${title}`,
      '',
      'SCRIPT ACTUEL:',
      script.slice(0, 22000),
      '',
      digest ? `DIGEST CONTEXTE:\n${digest.slice(0, 12000)}\n` : '',
      'HISTORIQUE CHAT PODCAST (optionnel):',
      JSON.stringify(safeHistory).slice(0, 7000),
      '',
      'DEMANDE UTILISATEUR:',
      userMessage,
      '',
      'TACHE: retourne STRICTEMENT un JSON valide: {"assistantReply":"...","updatedScript":"..."}',
      'assistantReply: message court pour confirmer les changements.',
      'updatedScript: script complet mis a jour, pret a etre lu a voix haute.',
    ].join('\n');

    const systemFr = [
      'Tu es un éditeur de scripts podcast de formation.',
      "Tu modifies le script oral selon la demande utilisateur, tout en gardant un ton professionnel, chaleureux, clair.",
      'Sortie JSON stricte uniquement, sans markdown, sans code fence.',
      'Le champ updatedScript doit contenir le script complet final (pas une diff partielle).',
    ].join(' ');

    const systemEn = [
      'You are a training podcast script editor.',
      'Apply the user request while keeping a clear, warm, professional oral tone.',
      'Output strict JSON only, no markdown, no code fences.',
      'updatedScript must be the full final script, not a partial diff.',
    ].join(' ');

    const raw = await aiService.generateWithClaude(
      prompt,
      lang.startsWith('en') ? systemEn : systemFr,
      anthropicKey,
      8192,
      { temperature: 0.35, preferredModels: ['claude-sonnet-4-5'] }
    );

    let parsed: any;
    try {
      parsed = aiService.parseJson(String(raw || ''), 'podcastChat');
    } catch {
      return res.status(502).json({ success: false, error: 'Réponse IA invalide pour podcast chat.' });
    }

    const assistantReply = String(parsed?.assistantReply || '').trim();
    const updatedScript = String(parsed?.updatedScript || '').trim();
    if (!updatedScript) {
      return res.status(502).json({ success: false, error: 'Le script mis à jour est vide.' });
    }

    return res.json({
      success: true,
      assistantReply: assistantReply || 'Script mis à jour.',
      updatedScript,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Sauvegarde un podcast (titre + script + historique) en DB
 * et pousse une version JSON du podcast dans Cloudinary.
 */
export const savePodcast = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      title,
      script,
      trainingTitle,
      language,
      gigId,
      companyId,
      audioUrl,
      audioCloudinaryPublicId,
      chatMessages,
    } = req.body || {};

    const cleanTitle = String(title || '').trim();
    const cleanScript = String(script || '').trim();
    if (!cleanTitle) {
      return res.status(400).json({ success: false, error: 'title is required' });
    }
    if (!cleanScript) {
      return res.status(400).json({ success: false, error: 'script is required' });
    }

    const safeGigId = toObjectIdOrUndefined(gigId);
    const safeCompanyId = toObjectIdOrUndefined(companyId);
    const safeLanguage = String(language || 'fr').trim().toLowerCase() || 'fr';
    const safeTrainingTitle = String(trainingTitle || '').trim();
    let resolvedAudioUrl = String(audioUrl || '').trim() || undefined;
    let resolvedAudioCloudinaryPublicId = String(audioCloudinaryPublicId || '').trim() || undefined;

    const safeChatMessages = Array.isArray(chatMessages)
      ? chatMessages
          .map((m: any) => ({
            role: m?.role === 'assistant' ? 'assistant' : 'user',
            text: String(m?.text || '').trim(),
            createdAt: m?.createdAt ? new Date(m.createdAt) : new Date(),
          }))
          .filter((m) => m.text)
          .slice(-80)
      : [];

    const fileBase = `podcast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let audioGenerationWarning: string | undefined;
    if (!resolvedAudioUrl) {
      try {
        const mp3Buffer = await generatePodcastMp3Buffer(cleanScript, safeLanguage);
        const uploadedAudio = await cloudinaryService.uploadAudioBuffer(
          mp3Buffer,
          `${fileBase}_audio`,
          'training-podcasts/audio'
        );
        resolvedAudioUrl = uploadedAudio.url;
        resolvedAudioCloudinaryPublicId = uploadedAudio.publicId;
      } catch (audioError: any) {
        audioGenerationWarning =
          String(audioError?.message || '').trim() || 'Audio generation failed; script saved without MP3.';
        console.warn('[savePodcast] Audio generation/upload failed, saving script only:', audioGenerationWarning);
      }
    }

    const cloudPayload = {
      title: cleanTitle,
      trainingTitle: safeTrainingTitle,
      language: safeLanguage,
      script: cleanScript,
      audioUrl: resolvedAudioUrl,
      gigId: safeGigId ? safeGigId.toString() : undefined,
      companyId: safeCompanyId ? safeCompanyId.toString() : undefined,
      chatMessages: safeChatMessages,
      savedAt: new Date().toISOString(),
    };
    const uploaded = await cloudinaryService.uploadJsonData(
      cloudPayload,
      fileBase,
      'training-podcasts'
    );

    const saved = await TrainingPodcast.create({
      gigId: safeGigId,
      companyId: safeCompanyId,
      title: cleanTitle,
      trainingTitle: safeTrainingTitle || undefined,
      language: safeLanguage,
      script: cleanScript,
      scriptCloudinaryUrl: uploaded.url,
      scriptCloudinaryPublicId: uploaded.publicId,
      audioUrl: resolvedAudioUrl,
      audioCloudinaryPublicId: resolvedAudioCloudinaryPublicId,
      chatMessages: safeChatMessages,
    });

    return res.json({
      success: true,
      warning: audioGenerationWarning,
      podcast: {
        _id: saved._id,
        title: saved.title,
        trainingTitle: saved.trainingTitle,
        language: saved.language,
        script: saved.script,
        scriptCloudinaryUrl: saved.scriptCloudinaryUrl,
        audioUrl: saved.audioUrl,
        createdAt: saved.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * Liste des podcasts sauvegardés (par gig ou company).
 */
export const listSavedPodcasts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const gigId = String(req.query.gigId || '').trim();
    const companyId = String(req.query.companyId || '').trim();
    const limitRaw = parseInt(String(req.query.limit || '20'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

    const filter: any = {};
    const safeGigId = toObjectIdOrUndefined(gigId);
    const safeCompanyId = toObjectIdOrUndefined(companyId);
    if (safeGigId) filter.gigId = safeGigId;
    if (safeCompanyId) filter.companyId = safeCompanyId;

    const rows = await TrainingPodcast.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      podcasts: rows.map((r: any) => ({
        _id: String(r._id),
        title: String(r.title || ''),
        trainingTitle: r.trainingTitle ? String(r.trainingTitle) : undefined,
        language: String(r.language || 'fr'),
        script: String(r.script || ''),
        scriptCloudinaryUrl: r.scriptCloudinaryUrl ? String(r.scriptCloudinaryUrl) : undefined,
        audioUrl: r.audioUrl ? String(r.audioUrl) : undefined,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

export const generateTrainingVideo = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    const trainingTitle = String(req.body?.trainingTitle || '').trim();
    const aspectRatio = String(req.body?.aspectRatio || '16:9').trim();
    const durationSeconds = Number(req.body?.durationSeconds || 8);
    if (!prompt) {
      return res.status(400).json({ success: false, error: 'prompt is required' });
    }
    const started = await triggerVeoGeneration({ prompt, aspectRatio, durationSeconds });
    const jobId = crypto.randomUUID();
    const now = Date.now();
    videoGenerationJobs.set(jobId, {
      id: jobId,
      provider: 'veo',
      model: started.model,
      status: 'queued',
      prompt,
      operationName: started.operationName,
      createdAt: now,
      updatedAt: now,
    });
    return res.json({
      success: true,
      jobId,
      provider: 'veo',
      model: started.model,
      operationName: started.operationName,
      trainingTitle: trainingTitle || undefined,
    });
  } catch (error) {
    return next(error);
  }
};

export const getTrainingVideoStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    const jobId = String(req.params.jobId || '').trim();
    const state = videoGenerationJobs.get(jobId);
    if (!state) {
      return res.status(404).json({ success: false, error: 'Video generation job not found' });
    }

    const now = Date.now();
    if (
      state.status !== 'completed' &&
      state.status !== 'failed' &&
      now - Number(state.createdAt || now) > VIDEO_JOB_TIMEOUT_MS
    ) {
      state.status = 'failed';
      state.error = state.error || 'Video generation timed out. Please try again.';
      state.updatedAt = now;
      videoGenerationJobs.set(jobId, state);
    }

    if (state.status !== 'completed' && state.status !== 'failed' && state.operationName) {
      state.status = 'running';
      state.updatedAt = Date.now();
      const polled = await pollVeoOperation(state.operationName);
      if (polled.done && polled.videoUrl) {
        state.status = 'completed';
        state.videoUrl = polled.videoUrl;
      } else if (polled.done && polled.error) {
        state.status = 'failed';
        state.error = polled.error;
      } else if (polled.error) {
        state.error = polled.error;
      }
      state.updatedAt = Date.now();
      videoGenerationJobs.set(jobId, state);
    }

    return res.json({
      success: true,
      jobId: state.id,
      status: state.status,
      provider: state.provider,
      model: state.model,
      videoUrl: state.videoUrl,
      error: state.error,
    });
  } catch (error) {
    return next(error);
  }
};

export const saveTrainingVideo = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const title = String(req.body?.title || '').trim();
    const prompt = String(req.body?.prompt || '').trim();
    const trainingTitle = String(req.body?.trainingTitle || '').trim();
    const provider = String(req.body?.provider || 'veo').trim() || 'veo';
    const model = String(req.body?.model || process.env.VEO_MODEL || 'veo-2.0-generate-001').trim();
    const gigId = req.body?.gigId;
    const companyId = req.body?.companyId;
    const jobId = String(req.body?.jobId || '').trim();
    let videoUrl = String(req.body?.videoUrl || '').trim();
    if (!title) return res.status(400).json({ success: false, error: 'title is required' });
    if (!prompt) return res.status(400).json({ success: false, error: 'prompt is required' });

    if (!videoUrl && jobId) {
      const state = videoGenerationJobs.get(jobId);
      videoUrl = String(state?.videoUrl || '').trim();
    }
    if (!videoUrl) {
      return res.status(400).json({ success: false, error: 'videoUrl is required (or completed jobId)' });
    }

    const safeGigId = toObjectIdOrUndefined(gigId);
    const safeCompanyId = toObjectIdOrUndefined(companyId);
    const uploaded = await cloudinaryService.uploadRemoteVideo(videoUrl, 'training-videos/generated');

    const saved = await TrainingVideo.create({
      gigId: safeGigId,
      companyId: safeCompanyId,
      title,
      trainingTitle: trainingTitle || undefined,
      prompt,
      provider,
      modelName: model,
      status: 'saved',
      videoUrl: uploaded.url,
      videoCloudinaryPublicId: uploaded.publicId,
    });

    return res.json({
      success: true,
      video: {
        _id: String(saved._id),
        title: saved.title,
        trainingTitle: saved.trainingTitle,
        prompt: saved.prompt,
        provider: saved.provider,
        model: saved.modelName,
        status: saved.status,
        videoUrl: saved.videoUrl,
        createdAt: saved.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const listSavedTrainingVideos = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const gigId = String(req.query.gigId || '').trim();
    const companyId = String(req.query.companyId || '').trim();
    const limitRaw = parseInt(String(req.query.limit || '20'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;

    const filter: any = {};
    const safeGigId = toObjectIdOrUndefined(gigId);
    const safeCompanyId = toObjectIdOrUndefined(companyId);
    if (safeGigId) filter.gigId = safeGigId;
    if (safeCompanyId) filter.companyId = safeCompanyId;

    const rows = await TrainingVideo.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({
      success: true,
      videos: rows.map((r: any) => ({
        _id: String(r._id),
        title: String(r.title || ''),
        trainingTitle: r.trainingTitle ? String(r.trainingTitle) : undefined,
        prompt: String(r.prompt || ''),
        provider: String(r.provider || 'veo'),
        model: String(r.modelName || ''),
        status: String(r.status || 'saved'),
        videoUrl: r.videoUrl ? String(r.videoUrl) : undefined,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
};

export const generateTrainingImages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const trainingDigest = String(req.body?.trainingDigest || '').trim();
    const trainingTitle = String(req.body?.trainingTitle || '').trim();
    const styleGuidance = String(req.body?.styleGuidance || '').trim();
    const language = String(req.body?.language || 'fr').trim().toLowerCase() || 'fr';
    const maxImages = Math.min(Math.max(Number(req.body?.maxImages || 8), 1), 20);
    const title = String(req.body?.title || `${trainingTitle || 'Training'} - Images`).trim().slice(0, 240);
    const safeGigId = toObjectIdOrUndefined(req.body?.gigId);
    const safeCompanyId = toObjectIdOrUndefined(req.body?.companyId);
    if (!trainingDigest) {
      return res.status(400).json({ success: false, error: 'trainingDigest is required' });
    }

    const storyboard = await buildImageStoryboardFromDigest({
      trainingDigest,
      trainingTitle,
      language,
      maxImages,
      styleGuidance,
    });
    const jobId = crypto.randomUUID();
    const now = Date.now();
    const state: TrainingImageGenerationJobState = {
      id: jobId,
      status: 'queued',
      title,
      trainingTitle: trainingTitle || undefined,
      language,
      gigId: safeGigId,
      companyId: safeCompanyId,
      sourceDigest: trainingDigest.slice(0, 40000),
      total: storyboard.length,
      completed: 0,
      items: [],
      createdAt: now,
      updatedAt: now,
    };
    trainingImageGenerationJobs.set(jobId, state);
    void processTrainingImageJob(jobId, storyboard);
    return res.json({
      success: true,
      jobId,
      status: state.status,
      total: state.total,
      completed: state.completed,
      items: state.items,
    });
  } catch (error) {
    return next(error);
  }
};

export const getTrainingImagesStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const jobId = String(req.params?.jobId || req.query?.jobId || '').trim();
    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'jobId is required. Use /api/ai/training-images/status/:jobId or /api/ai/training-images/status?jobId=...',
      });
    }
    const state = trainingImageGenerationJobs.get(jobId);
    if (!state) return res.status(404).json({ success: false, error: 'Training image job not found' });

    const now = Date.now();
    if (
      (state.status === 'queued' || state.status === 'running') &&
      now - Number(state.createdAt || now) > TRAINING_IMAGE_JOB_TIMEOUT_MS
    ) {
      state.status = 'failed';
      state.error = 'Training image generation timed out.';
      state.updatedAt = now;
      trainingImageGenerationJobs.set(jobId, state);
    }
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.json({
      success: true,
      jobId: state.id,
      status: state.status,
      total: state.total,
      completed: state.completed,
      items: state.items,
      savedImageSetId: state.savedImageSetId,
      error: state.error,
    });
  } catch (error) {
    return next(error);
  }
};

export const listTrainingImages = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const gigId = String(req.query.gigId || '').trim();
    const companyId = String(req.query.companyId || '').trim();
    const limitRaw = parseInt(String(req.query.limit || '20'), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;
    const filter: any = {};
    const safeGigId = toObjectIdOrUndefined(gigId);
    const safeCompanyId = toObjectIdOrUndefined(companyId);
    if (safeGigId) filter.gigId = safeGigId;
    if (safeCompanyId) filter.companyId = safeCompanyId;

    const rows = await TrainingImageSet.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({
      success: true,
      imageSets: rows.map((r: any) => ({
        _id: String(r._id),
        title: String(r.title || ''),
        trainingTitle: r.trainingTitle ? String(r.trainingTitle) : undefined,
        language: String(r.language || 'fr'),
        items: Array.isArray(r.items)
          ? r.items.map((it: any) => ({
              index: Number(it.index || 0),
              title: String(it.title || ''),
              prompt: String(it.prompt || ''),
              imageUrl: String(it.imageUrl || ''),
              imageCloudinaryPublicId: it.imageCloudinaryPublicId ? String(it.imageCloudinaryPublicId) : undefined,
            }))
          : [],
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    return next(error);
  }
};
