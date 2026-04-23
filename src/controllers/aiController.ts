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
import StructuredTrainingSlides from '../models/StructuredTrainingSlides';
import TrainingJourney from '../models/TrainingJourney';
import {
  isPlanAffirmationMessage,
  looksLikeTrainingPlanText,
  persistValidatedChatPlan,
} from '../utils/chatPlanValidation';
import mongoose from 'mongoose';
import fs from 'fs';
import { promisify } from 'util';
import crypto from 'crypto';
import { GoogleAuth } from 'google-auth-library';
import { ImageGenerationService } from '../services/imageGenerationService';

const unlinkAsync = promisify(fs.unlink);
const HARX_STYLE_TAG_REGEX = /<harx-style>\s*\{[\s\S]*?\}\s*<\/harx-style>/i;
const HARX_TRAINING_STATUS_REGEX = /<harx-training-status>\s*([\s\S]*?)\s*<\/harx-training-status>/i;
const CHAT_CONFIRM_PLAN_CMD_REGEX = /^__CONFIRM_PLAN_SAVE__(?::([a-zA-Z0-9_-]{6,64}))?$/;
const CHAT_VALIDATE_MODULE_CONTENT_CMD = '__VALIDATE_MODULE_CONTENT__';
const CHAT_VALIDATE_ALL_MODULES_CONTENT_CMD = '__VALIDATE_ALL_MODULES_CONTENT__';
const HARX_PLAN_CONFIRM_TOKEN = '__CONFIRM_PLAN_SAVE__';
const HARX_PLAN_CONFIRM_REGEX = /<harx-plan-confirm>\s*([\s\S]*?)\s*<\/harx-plan-confirm>/i;

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
  const isPlanValidated = Boolean(parsedContext?.planValidatedFromDb);

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
    'Si curriculumOutline est vide/incomplet, deduis les modules depuis la reponse assistant (patterns "Module X" ou emojis 🟢🟡🟠🔵) avant de conclure.',
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

  const requestedOutput = String(parsedContext?.requestedOutput || '').toLowerCase();
  const actions: { id: string; label: string }[] = [];
  if (isPlanValidated) {
    if (readiness === 'ready' && missingModules.length === 0) {
      if (requestedOutput === 'module_content') {
        actions.push({ id: 'validate_module_content', label: 'Valider ce contenu module' });
      } else if (requestedOutput === 'full_training_content') {
        actions.push({ id: 'validate_all_modules_content', label: 'Valider le contenu de tous les modules' });
      } else {
        actions.push({ id: 'validate_training', label: 'Valider la formation' });
      }
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
  } else {
    messageFr =
      "Le plan n'est pas encore validé. Validez d'abord le plan pour activer les boutons de validation du contenu.";
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

const isPlanEditRequest = (message: string): boolean =>
  /\b(modifi|modifier|change|changer|ajuste|ajouter|supprim|retir|update|edit|corrig|restructur|reorganis|adapt|nouveau\s+plan|nouveau|g[ée]n[ée]r\w*\s+.*plan|cr[ée]er?\s+.*plan)\b/i.test(
    String(message || '')
  );

const sanitizeAssistantPlanText = (raw: string): string =>
  String(raw || '')
    .replace(/<harx-style>[\s\S]*?<\/harx-style>/gi, '')
    .replace(HARX_TRAINING_STATUS_REGEX, '')
    .replace(HARX_PLAN_CONFIRM_REGEX, '')
    .trim();

const buildSavedPlanAnchor = (journey: any): string => {
  if (!journey) return '';
  const modulePlan = Array.isArray(journey.modulePlan) ? journey.modulePlan : [];
  if (modulePlan.length > 0) {
    const compact = modulePlan
      .map((m: any, idx: number) => ({
        module: idx + 1,
        title: String(m?.title || '').trim(),
        objectifs: Array.isArray(m?.objectifs) ? m.objectifs.slice(0, 8) : [],
        keyTopics: Array.isArray(m?.keyTopics) ? m.keyTopics.slice(0, 10) : [],
        activites: Array.isArray(m?.activites) ? m.activites.slice(0, 10) : [],
        durationMinutes: typeof m?.durationMinutes === 'number' ? m.durationMinutes : undefined,
      }))
      .filter((x: any) => x.title);
    if (compact.length > 0) {
      return `\n--- SAVED TRAINING PLAN (LOCKED SOURCE OF TRUTH) ---\n${JSON.stringify(compact).slice(0, 15000)}\n`;
    }
  }
  const modules = Array.isArray(journey.modules) ? journey.modules : [];
  const fallback = modules
    .map((m: any, idx: number) => ({
      module: idx + 1,
      title: String(m?.title || '').trim(),
      objectives: Array.isArray(m?.learningObjectives) ? m.learningObjectives.slice(0, 8) : [],
      keyTopics: Array.isArray(m?.topics) ? m.topics.slice(0, 10) : [],
    }))
    .filter((x: any) => x.title);
  return fallback.length > 0
    ? `\n--- SAVED TRAINING PLAN (LOCKED SOURCE OF TRUTH) ---\n${JSON.stringify(fallback).slice(0, 12000)}\n`
    : '';
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
  renderMode: 'ai_images' | 'template_slides';
  title: string;
  trainingTitle?: string;
  language: string;
  /** training_journeys._id — lier le jeu d’images au parcours après génération */
  trainingJourneyId?: string;
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

/** REP training digest: chat thread marked PRIMARY in ContentUploader. */
const extractPrimaryChatTrainingBlock = (digest: string): string => {
  const d = String(digest || '');
  const marker = '--- Training chat (PRIMARY';
  const idx = d.indexOf(marker);
  if (idx === -1) return '';
  const tail = d.slice(idx);
  const stop = tail.indexOf('\n--- Supporting reference');
  const body = (stop === -1 ? tail : tail.slice(0, stop)).trim();
  const max = 16000;
  // Long threads: keep the **end** so the latest user instructions (e.g. new training format) are not dropped.
  if (body.length <= max) return body;
  return body.slice(-max);
};

/**
 * Titre affiché sur les slides : préfère le sujet réel (doc KB, formation citée dans le chat)
 * plutôt que le seul intitulé gig/poste, pour éviter « Développeur Huawei » sur un cours assurance.
 */
const inferBrandingTitleForSlides = (digest: string, trainingTitle: string): string => {
  const d = String(digest || '');
  const tt = String(trainingTitle || '').trim();
  const primary = extractPrimaryChatTrainingBlock(d);

  if (primary.length > 80) {
    const parts = primary.split(/Assistant:\s*/i);
    const lastAssistant = parts[parts.length - 1] || '';
    const lines = lastAssistant.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 40)) {
      const cleaned = line
        .replace(/^#+\s*/, '')
        .replace(/^📘\s*/, '')
        .replace(/^formation\s*:\s*/i, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/[*_`#]+/g, '')
        .trim();
      if (cleaned.length < 8 || cleaned.length > 140) continue;
      if (/^(module|chapitre)\s+\d+/i.test(cleaned)) continue;
      if (/^(depuis|vous|en cas|si|pour)\b/i.test(cleaned)) continue;
      return cleaned.slice(0, 120);
    }
  }

  const kbIdx = d.search(/---\s*Base de connaissances/i);
  if (kbIdx !== -1) {
    const slice = d.slice(kbIdx, kbIdx + 4000);
    for (const line of slice.split('\n')) {
      const m = line.match(/^\s*•\s+(.+)/);
      if (m?.[1]) {
        const name = String(m[1])
          .replace(/\.(pdf|docx?|txt|png|jpe?g|webp)$/i, '')
          .trim();
        if (name.length > 3 && name.length < 200) return name.slice(0, 180);
      }
    }
  }

  if (primary.length > 80) {
    const parts = primary.split(/Assistant:\s*/i);
    const lastAssistant = parts[parts.length - 1] || '';
    const lines = lastAssistant.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines.slice(0, 30)) {
      if (/^#{1,3}\s+\S/.test(line)) return line.replace(/^#+\s*/, '').slice(0, 180);
      if (/^📘\s*\S/.test(line)) return line.replace(/^📘\s*/, '').slice(0, 180);
      if (/^formation\s*:/i.test(line)) return line.replace(/^formation\s*:\s*/i, '').slice(0, 180);
      if (/^module\s+\d+/i.test(line)) return line.slice(0, 180);
    }

    const low = primary.toLowerCase();
    const gigLike =
      /\b(développeur|developer|ingénieur|engineer|consultant|commercial|opérationnel)\b/i.test(tt) &&
      !/\b(assurance|sinistre|contrat)\b/i.test(tt);
    if (gigLike && /\b(assurance|assureur|sinistre|prime|contrat|garantie|indemnisation)\b/.test(low)) {
      const m = primary.match(/formation\s+assurance[^\n]*/i);
      if (m) return m[0].trim().slice(0, 180);
      return 'Formation assurance';
    }
  }

  if (tt) return tt.slice(0, 180);
  return 'Formation';
};

const chunkTextForSlides = (text: string, maxChunks: number, maxChunkLen: number): string[] => {
  const t = String(text || '').trim();
  if (!t) return [];
  const paras = t.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf = '';
  for (const p of paras) {
    const next = buf ? `${buf}\n\n${p}` : p;
    if (next.length > maxChunkLen && buf) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = next;
    }
  }
  if (buf) chunks.push(buf);
  if (!chunks.length) chunks.push(t.slice(0, maxChunkLen));
  return chunks.slice(0, Math.max(1, maxChunks));
};

const slideTitleFromChunk = (chunk: string, fallback: string): string => {
  const lines = String(chunk || '').split(/\n/).map((l) => l.trim());
  for (const l of lines) {
    if (l.length > 12 && l.length < 90) {
      const cleaned = l
        .replace(/^[-•*]\s*/, '')
        .replace(/^(User|Assistant)\s*:\s*/i, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/^#+\s*/, '')
        .replace(/[*_`#]+/g, '')
        .trim();
      if (cleaned.length > 12 && cleaned.length < 90) return cleaned.slice(0, 88);
    }
  }
  return fallback.slice(0, 88);
};

const extractSlideBulletsFromText = (text: string, maxBullets = 4): string[] => {
  const src = String(text || '');
  const lines = src
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) =>
      l
        .replace(/^\s*[-•*]\s+/, '')
        .replace(/^\d+[.)]\s+/, '')
        .replace(/^(User|Assistant)\s*:\s*/i, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/^#+\s*/, '')
        .replace(/[*_`#]+/g, '')
        .trim()
    )
    .filter((l) => l.length >= 16)
    .filter((l) => !/^source thread/i.test(l))
    .filter((l) => !/^agenda items derived/i.test(l))
    .filter((l) => !/derive visible title/i.test(l))
    .filter((l) => !/stay faithful/i.test(l))
    .filter((l) => !/training overview for/i.test(l))
    .filter((l) => !/^\[(intro|conclusion|point\s*\d+).*\]/i.test(l))
    .filter((l) => !/^\s*>\s*[«"]?/i.test(l))
    .filter((l) => !/^(parfait|ah d['’]accord|non juste|bonjour|salut)\b/i.test(l))
    .filter((l) => !/\b(je te pr[ée]pare|tu veux|peux-tu me confirmer|dis-moi simplement)\b/i.test(l))
    .filter((l) => !/\b(script podcast|dur[ée]e cible|accroche percutante|ton conversationnel|ton dynamique|accueillant)\b/i.test(l));

  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const compact = line.replace(/\s+/g, ' ').trim();
    if (compact.length < 16) continue;
    const key = compact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(compact.slice(0, 140));
    if (out.length >= maxBullets) break;
  }
  if (out.length > 0) return out;

  const sentenceChunks = src
    .replace(/\n+/g, ' ')
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 24);
  const fallback: string[] = [];
  for (const s of sentenceChunks) {
    fallback.push(s.slice(0, 140));
    if (fallback.length >= maxBullets) break;
  }
  return fallback.length > 0
    ? fallback
    : ['Comprendre les points cles', 'Retenir les bonnes pratiques', 'Appliquer les actions recommandees'].slice(
        0,
        maxBullets
      );
};

const buildDefaultBlocksFromBullets = (
  title: string,
  bullets: string[],
  notes?: string
): StructuredSlideBlock[] => {
  const out: StructuredSlideBlock[] = [];
  const cleanBullets = (Array.isArray(bullets) ? bullets : []).filter(Boolean).slice(0, 6);
  if (cleanBullets.length > 0) {
    out.push({ type: 'bullets', title, items: cleanBullets });
  }
  if (cleanBullets.length > 0) {
    const statLike = cleanBullets.find((b) => /\d+[%kKmM]?|\beuros?\b|\bans?\b|\bheures?\b/i.test(b));
    if (statLike) {
      const m = statLike.match(/(\d+[%kKmM]?)/);
      out.push({
        type: 'stat',
        value: m?.[1] || statLike.slice(0, 24),
        label: 'Indicateur clé',
        source: statLike.slice(0, 120),
      });
    }
  }
  if (notes) {
    out.push({ type: 'quote', text: notes.slice(0, 220) });
  }
  return out;
};

const extractLastPedagogicalAssistantBlock = (primaryChat: string): string => {
  const text = String(primaryChat || '');
  if (!text) return '';
  const blocks = text
    .split(/\n(?=Assistant:\s*)/g)
    .map((b) => b.trim())
    .filter((b) => /^Assistant:\s*/i.test(b))
    .map((b) => b.replace(/^Assistant:\s*/i, '').trim());
  if (blocks.length === 0) return '';

  const quality = (b: string): number => {
    const hasPedagogy = /\b(module|plan|objectifs?|conclusion|exclusion|indemnisation|sinistre|formation|cl[ée]s?)\b/i.test(b) ? 6 : 0;
    const hasBullets = /(^|\n)\s*([-•*]|\d+[.)])\s+/m.test(b) ? 5 : 0;
    const hasHeading = /(^|\n)\s*#{1,3}\s+/m.test(b) ? 4 : 0;
    const tooConversational = /\b(peux-tu|dis-moi|je peux|je te)\b/i.test(b) ? -5 : 0;
    const podcastScriptLike =
      /\[(intro|conclusion|point\s*\d+).*\]|\bscript podcast\b|\bton dynamique\b|\baccroche\b/i.test(b) ? -9 : 0;
    return hasPedagogy + hasBullets + hasHeading + tooConversational + podcastScriptLike + Math.min(6, Math.floor(b.length / 500));
  };

  // Prefer latest good pedagogical block.
  let best = blocks[blocks.length - 1];
  let bestScore = -Infinity;
  for (let i = blocks.length - 1; i >= Math.max(0, blocks.length - 8); i -= 1) {
    const b = blocks[i];
    const s = quality(b);
    if (s >= bestScore) {
      bestScore = s;
      best = b;
    }
  }
  return best;
};

const tryParseStructuredSlidesJson = (raw: string): any => {
  const txt = String(raw || '').trim();
  if (!txt) throw new Error('Empty structured slides payload');

  const noFence = txt
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(noFence);
  } catch {
    // continue
  }

  const firstBrace = noFence.indexOf('{');
  if (firstBrace === -1) throw new Error('No JSON object found');
  const candidate = noFence.slice(firstBrace);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const balanced = candidate.slice(0, i + 1);
        return JSON.parse(balanced);
      }
    }
  }
  throw new Error('Could not recover balanced JSON object');
};

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
  styleGuidance?: string;
  renderMode?: 'ai_images' | 'template_slides';
}): Array<{ title: string; prompt: string }> => {
  const lang = String(params.language || 'fr').toLowerCase();
  const isFr = lang.startsWith('fr');
  const digest = String(params.trainingDigest || '');
  const chatPrimary = extractPrimaryChatTrainingBlock(digest);
  const digestChunksRaw =
    chatPrimary.length > 120 ? chunkTextForSlides(chatPrimary, Math.max(params.maxImages, 10), 2000) : [];
  /** Newest chat chunks first so early content slides follow the latest learner intent. */
  const digestChunks = [...digestChunksRaw].reverse();

  const lines = digest.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidateTitles = lines
    .filter((l) => /^(#+\s*)?(module|chapitre|section|slide|partie|topic|theme)\b/i.test(l) || l.length < 90)
    .map((l) => l.replace(/^#+\s*/, '').replace(/^[-•\d.)\s]+/, '').slice(0, 90))
    .filter((v, i, arr) => v.length > 8 && arr.indexOf(v) === i)
    .slice(0, Math.max(params.maxImages - 3, 1));

  const total = Math.max(3, params.maxImages);
  const middleCount = Math.max(total - 3, 1);
  const middleTitles = Array.from({ length: middleCount }).map((_, i) => {
    const chunk = digestChunks[i];
    if (chunk) {
      return slideTitleFromChunk(chunk, isFr ? `Contenu ${i + 1}` : `Content ${i + 1}`);
    }
    const picked = candidateTitles[i];
    if (picked) return picked;
    return isFr ? `Contenu ${i + 1}` : `Content ${i + 1}`;
  });

  const titleBase = inferBrandingTitleForSlides(digest, String(params.trainingTitle || '').trim());
  const styleHint = String(params.styleGuidance || '').trim();
  const styleSuffix = styleHint ? ` Style guidance: ${styleHint.slice(0, 220)}.` : '';
  const templateMode = params.renderMode === 'template_slides';
  const out: Array<{ title: string; prompt: string }> = [];

  const coverContext =
    chatPrimary.length > 120
      ? chatPrimary.length > 2000
        ? ` Reflect the **latest** learner goal (end of thread) in the title and subtitle:\n${chatPrimary.slice(-2400)}`
        : ` Base the main title and subtitle on this learner conversation:\n${chatPrimary.slice(0, 1600)}`
      : '';
  out.push({
    title: isFr ? `${titleBase} - Couverture` : `${titleBase} - Cover`,
    prompt: templateMode
      ? extractSlideBulletsFromText(coverContext || chatPrimary || digest, 4).join('\n')
      : `[COVER] Single coherent course title: "${titleBase}". Do NOT mix an unrelated job/gig name with this course title in headers or footers. Professional training title slide, clear headline and subhead, light background, educational layout.${coverContext}${styleSuffix}`,
  });

  const agendaLines =
    digestChunks.length > 0
      ? digestChunks
          .slice(0, Math.min(8, middleCount + 2))
          .map((c, j) => `${j + 1}. ${slideTitleFromChunk(c, `Section ${j + 1}`)}`)
          .join('\n')
          .slice(0, 1400)
      : '';
  const agendaContext =
    agendaLines.length > 40
      ? `\nAgenda items derived from the training chat thread:\n${agendaLines}`
      : chatPrimary.length > 120
        ? `\nSummarize key themes from the **latest** part of the chat as 4–7 short agenda lines:\n${chatPrimary.slice(-1400)}`
        : '';
  out.push({
    title: isFr ? 'Plan de formation' : 'Training agenda',
    prompt: templateMode
      ? extractSlideBulletsFromText(agendaLines || agendaContext || chatPrimary, 6).join('\n')
      : `[AGENDA] Training overview for "${titleBase}" only (no second unrelated brand line). Agenda-style slide with readable section list, horizontal blocks.${agendaContext}${styleSuffix}`,
  });

  for (let i = 0; i < middleCount; i += 1) {
    const t = middleTitles[i];
    const chunk = digestChunks[i] || (chatPrimary.length > 120 ? chatPrimary.slice(-2400) : '');
    const sourceBlock =
      chunk.length > 80
        ? `\n\nSource thread (stay faithful — derive visible title and 3–5 bullets from this text):\n${chunk.slice(0, 3200)}`
        : '';
    out.push({
      title: t,
      prompt: templateMode
        ? extractSlideBulletsFromText(chunk || sourceBlock || chatPrimary, 4).join('\n')
        : `[CONTENT] Content slide "${t}" for course "${titleBase}" only. Pedagogical PowerPoint look, title at top, 3–4 short bullets (max ~90 chars each in French); if text is long, shorten wording—never clip at canvas edge. No overlapping side callouts on bullet area.${sourceBlock}${styleSuffix}`,
    });
  }

  const closing =
    chatPrimary.length > 120
      ? chatPrimary.slice(-3400)
      : digestChunks.length > 0
        ? digestChunks[0]
        : '';
  const conclusionContext =
    String(closing).length > 120
      ? `\n\nClosing summary grounded in:\n${String(closing).slice(0, 2800)}`
      : '';
  out.push({
    title: isFr ? 'Conclusion' : 'Conclusion',
    prompt: templateMode
      ? extractSlideBulletsFromText(conclusionContext || closing || chatPrimary, 4).join('\n')
      : `[CONCLUSION] Closing slide for "${titleBase}" only (one footer line, same subject as bullets—no job role + course mashup). Visual recap with 3–4 very short bullets; place any checklist/callout box fully below bullets with 40px+ gap—no overlap.${conclusionContext}${styleSuffix}`,
  });
  return out.slice(0, total);
};

const buildImageStoryboardFromDigest = async (params: {
  trainingDigest: string;
  trainingTitle?: string;
  language?: string;
  maxImages?: number;
  styleGuidance?: string;
  renderMode?: 'ai_images' | 'template_slides';
}): Promise<Array<{ title: string; prompt: string }>> => {
  const maxImages = Math.min(Math.max(Number(params.maxImages || 8), 1), 20);
  return buildDeterministicStoryboardFallback({
    trainingDigest: params.trainingDigest,
    trainingTitle: params.trainingTitle,
    language: params.language,
    maxImages,
    styleGuidance: params.styleGuidance,
    renderMode: params.renderMode,
  });
};

type StructuredTrainingSlide = {
  index: number;
  kind: 'cover' | 'agenda' | 'content' | 'conclusion';
  title: string;
  bullets: string[];
  notes?: string;
  layout?: 'standard' | 'split' | 'highlight' | 'timeline';
  blocks?: StructuredSlideBlock[];
};

type StructuredSlideBlock = {
  type: 'paragraph' | 'bullets' | 'kpi' | 'quote' | 'table' | 'stat' | 'image_prompt';
  title?: string;
  text?: string;
  items?: string[];
  value?: string;
  label?: string;
  headers?: string[];
  rows?: string[][];
  source?: string;
};

type StructuredTrainingTheme = {
  template: 'corporate' | 'dark' | 'minimal' | 'learning' | 'executive';
  accentColor: string;
  backgroundStyle?: 'light' | 'gradient' | 'dark';
  coverImageUrl?: string;
  coverImagePrompt?: string;
};

const buildStructuredSlidesFromDigest = (params: {
  trainingDigest: string;
  trainingTitle?: string;
  language?: string;
  maxSlides?: number;
}): { title: string; language: string; theme: StructuredTrainingTheme; slides: StructuredTrainingSlide[] } => {
  const language = String(params.language || 'fr').trim().toLowerCase() || 'fr';
  const maxSlides = Math.min(Math.max(Number(params.maxSlides || 12), 3), 30);
  const trainingDigest = String(params.trainingDigest || '');
  const titleBase = inferBrandingTitleForSlides(trainingDigest, String(params.trainingTitle || '').trim());
  const primary = extractPrimaryChatTrainingBlock(trainingDigest);
  const assistantPedagogical = extractLastPedagogicalAssistantBlock(primary);
  const sourceText = assistantPedagogical || primary || trainingDigest;
  const chunks = chunkTextForSlides(sourceText, Math.max(maxSlides, 10), 2200);
  const agendaBullets = extractSlideBulletsFromText(chunks.slice(0, 3).join('\n'), 6);
  const slides: StructuredTrainingSlide[] = [];

  slides.push({
    index: 1,
    kind: 'cover',
    title: titleBase,
    bullets: extractSlideBulletsFromText(sourceText.slice(0, 1400), 3),
    notes: 'Introduction',
    layout: 'highlight',
    blocks: buildDefaultBlocksFromBullets(titleBase, extractSlideBulletsFromText(sourceText.slice(0, 1400), 3), 'Introduction'),
  });
  slides.push({
    index: 2,
    kind: 'agenda',
    title: language.startsWith('fr') ? 'Plan de formation' : 'Training agenda',
    bullets: agendaBullets.length ? agendaBullets : [language.startsWith('fr') ? 'Objectifs de la session' : 'Session goals'],
    layout: 'timeline',
    blocks: buildDefaultBlocksFromBullets(
      language.startsWith('fr') ? 'Plan' : 'Agenda',
      agendaBullets.length ? agendaBullets : [language.startsWith('fr') ? 'Objectifs de la session' : 'Session goals']
    ),
  });

  const contentCount = Math.max(1, maxSlides - 3);
  for (let i = 0; i < contentCount; i += 1) {
    const c = chunks[i] || chunks[chunks.length - 1] || sourceText;
    const t = slideTitleFromChunk(c, language.startsWith('fr') ? `Contenu ${i + 1}` : `Content ${i + 1}`);
    const contentBullets = extractSlideBulletsFromText(c, 5);
    slides.push({
      index: slides.length + 1,
      kind: 'content',
      title: t,
      bullets: contentBullets,
      layout: i % 2 === 0 ? 'standard' : 'split',
      blocks: buildDefaultBlocksFromBullets(t, contentBullets),
    });
    if (slides.length >= maxSlides - 1) break;
  }

  const conclusionBullets = extractSlideBulletsFromText(sourceText.slice(-2200), 4);
  slides.push({
    index: slides.length + 1,
    kind: 'conclusion',
    title: language.startsWith('fr') ? 'Conclusion' : 'Conclusion',
    bullets: conclusionBullets,
    notes: language.startsWith('fr') ? 'Messages a retenir' : 'Key takeaways',
    layout: 'highlight',
    blocks: buildDefaultBlocksFromBullets(
      language.startsWith('fr') ? 'À retenir' : 'Key takeaways',
      conclusionBullets,
      language.startsWith('fr') ? 'Messages a retenir' : 'Key takeaways'
    ),
  });

  return {
    title: titleBase,
    language,
    theme: { template: 'corporate', accentColor: '#be123c', backgroundStyle: 'light' },
    slides: slides.slice(0, maxSlides),
  };
};

const generateStructuredSlidesWithClaude = async (params: {
  trainingDigest: string;
  trainingTitle?: string;
  language: string;
  maxSlides: number;
  anthropicKey?: string;
}): Promise<{ title: string; language: string; theme: StructuredTrainingTheme; slides: StructuredTrainingSlide[] }> => {
  const titleBase = inferBrandingTitleForSlides(params.trainingDigest, String(params.trainingTitle || '').trim());
  const lang = String(params.language || 'fr').toLowerCase();
  const maxSlides = Math.min(Math.max(Number(params.maxSlides || 12), 3), 30);
  const primary = extractPrimaryChatTrainingBlock(params.trainingDigest);
  const pedagogical = extractLastPedagogicalAssistantBlock(primary);
  const source = (pedagogical || primary || params.trainingDigest).slice(-22000);

  const prompt = [
    'Create structured pedagogical slides JSON from this training chat content.',
    `Language: ${lang}`,
    `Max slides: ${maxSlides}`,
    `Course title seed: ${titleBase}`,
    '',
    'SOURCE CONTENT (authoritative):',
    source,
    '',
    'Return ONLY valid JSON with this exact schema:',
    '{"title":"", "language":"fr", "theme":{"template":"corporate|dark|minimal|learning|executive","accentColor":"#RRGGBB","backgroundStyle":"light|gradient|dark"},"slides":[{"index":1,"kind":"cover|agenda|content|conclusion","layout":"standard|split|highlight|timeline","title":"","bullets":[""],"notes":"","blocks":[{"type":"paragraph|bullets|kpi|quote|table|stat|image_prompt","title":"","text":"","items":[""],"value":"","label":"","headers":[""],"rows":[[""]],"source":""}]}]}',
    'Rules:',
    '- Base every bullet on source content (no meta-dialogue, no "I prepare", no Q/A chatter).',
    '- Cover/agenda/content/conclusion progression.',
    '- 3 to 5 bullets per slide, concise, professional.',
    '- Remove markdown symbols (** ### etc).',
    '- Keep slide titles short and meaningful.',
    '- Prefer rich blocks in "blocks": mix bullets, paragraph, stat/kpi, quote, simple table when relevant.',
  ].join('\n');

  const raw = await aiService.generateWithClaude(
    prompt,
    'You generate strict JSON training slides only.',
    params.anthropicKey,
    7000,
    { temperature: 0.2, preferredModels: [String(process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5')] }
  );
  const parsed = tryParseStructuredSlidesJson(String(raw || ''));
  const slidesIn = Array.isArray(parsed?.slides) ? parsed.slides : [];
  const slides: StructuredTrainingSlide[] = slidesIn
    .map((s: any, idx: number) => ({
      index: idx + 1,
      kind:
        s?.kind === 'cover' || s?.kind === 'agenda' || s?.kind === 'content' || s?.kind === 'conclusion'
          ? s.kind
          : idx === 0
            ? 'cover'
            : idx === 1
              ? 'agenda'
              : idx === slidesIn.length - 1
                ? 'conclusion'
                : 'content',
      layout:
        s?.layout === 'standard' || s?.layout === 'split' || s?.layout === 'highlight' || s?.layout === 'timeline'
          ? s.layout
          : idx === 0
            ? 'highlight'
            : idx === 1
              ? 'timeline'
              : 'standard',
      title: String(s?.title || '').replace(/[*_`#]+/g, '').trim().slice(0, 120),
      bullets: (Array.isArray(s?.bullets) ? s.bullets : [])
        .map((b: any) => String(b || '').replace(/[*_`#]+/g, '').trim())
        .filter(Boolean)
        .slice(0, 5),
      notes: s?.notes ? String(s.notes).slice(0, 240) : undefined,
      blocks: Array.isArray(s?.blocks)
        ? (s.blocks as any[])
            .map((b: any) => ({
              type:
                b?.type === 'paragraph' ||
                b?.type === 'bullets' ||
                b?.type === 'kpi' ||
                b?.type === 'quote' ||
                b?.type === 'table' ||
                b?.type === 'stat' ||
                b?.type === 'image_prompt'
                  ? b.type
                  : 'paragraph',
              title: b?.title ? String(b.title).slice(0, 120) : undefined,
              text: b?.text ? String(b.text).slice(0, 500) : undefined,
              items: Array.isArray(b?.items) ? b.items.map((x: any) => String(x).slice(0, 160)).filter(Boolean).slice(0, 8) : undefined,
              value: b?.value ? String(b.value).slice(0, 40) : undefined,
              label: b?.label ? String(b.label).slice(0, 80) : undefined,
              headers: Array.isArray(b?.headers) ? b.headers.map((x: any) => String(x).slice(0, 40)).filter(Boolean).slice(0, 5) : undefined,
              rows: Array.isArray(b?.rows)
                ? b.rows
                    .map((r: any) => (Array.isArray(r) ? r.map((c: any) => String(c).slice(0, 80)).slice(0, 5) : []))
                    .filter((r: string[]) => r.length > 0)
                    .slice(0, 6)
                : undefined,
              source: b?.source ? String(b.source).slice(0, 120) : undefined,
            }))
            .filter((b: StructuredSlideBlock) => b.type && (b.text || (b.items && b.items.length) || b.value || (b.rows && b.rows.length)))
            .slice(0, 6)
        : undefined,
    }))
    .map((s: StructuredTrainingSlide) => ({
      ...s,
      blocks: s.blocks && s.blocks.length > 0 ? s.blocks : buildDefaultBlocksFromBullets(s.title, s.bullets, s.notes),
    }))
    .filter((s: StructuredTrainingSlide) => s.title && (s.bullets.length > 0 || (s.blocks && s.blocks.length > 0)))
    .slice(0, maxSlides);
  if (slides.length < 3) {
    throw new Error('Claude structured slides result too small');
  }
  return {
    title: String(parsed?.title || titleBase).trim().slice(0, 180) || titleBase,
    language: String(parsed?.language || lang).trim() || lang,
    theme: {
      template:
        parsed?.theme?.template === 'dark' ||
        parsed?.theme?.template === 'minimal' ||
        parsed?.theme?.template === 'learning' ||
        parsed?.theme?.template === 'executive'
          ? parsed.theme.template
          : 'corporate',
      accentColor: /^#[0-9a-f]{6}$/i.test(String(parsed?.theme?.accentColor || '')) ? String(parsed.theme.accentColor) : '#be123c',
      backgroundStyle:
        parsed?.theme?.backgroundStyle === 'gradient' || parsed?.theme?.backgroundStyle === 'dark'
          ? parsed.theme.backgroundStyle
          : 'light',
    },
    slides,
  };
};

const generateStructuredCoverImage = async (params: {
  title: string;
  language: string;
  bullets: string[];
}): Promise<{ coverImageUrl?: string; coverImagePrompt?: string }> => {
  try {
    const lang = String(params.language || 'fr').toLowerCase();
    const bullets = (params.bullets || []).slice(0, 4).join(' | ').slice(0, 320);
    const prompt = [
      lang.startsWith('fr')
        ? `Couverture de formation: ${params.title}.`
        : `Training cover: ${params.title}.`,
      lang.startsWith('fr')
        ? 'Illustration corporate moderne, professionnelle, 16:9, sans texte incruste.'
        : 'Modern corporate 16:9 cover illustration, no embedded text.',
      bullets ? `Key themes: ${bullets}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    const imgBuffer = await ImageGenerationService.generateImageBuffer(prompt, undefined, 'thumbnail');
    const uploaded = await cloudinaryService.uploadImageBuffer(imgBuffer, 'training-images/generated', 'png');
    return {
      coverImageUrl: uploaded.url,
      coverImagePrompt: prompt,
    };
  } catch (e: any) {
    console.warn('[training-slides-json] Cover image generation failed:', String(e?.message || e));
    return {};
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
        renderMode: state.renderMode,
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
      const imgBuffer =
        state.renderMode === 'template_slides'
          ? ImageGenerationService.generateTemplateSlideBuffer({
              title: scene.title,
              prompt: scene.prompt,
              trainingTitle: state.trainingTitle,
              language: state.language,
              index: i + 1,
              total: storyboard.length,
            })
          : await ImageGenerationService.generateImageBuffer(scene.prompt);
      const uploaded = await cloudinaryService.uploadImageBuffer(
        imgBuffer,
        'training-images/generated',
        state.renderMode === 'template_slides' ? 'svg' : 'png'
      );
      const imageUrl = uploaded.url;
      const imageCloudinaryPublicId = uploaded.publicId;
      const nextItem = {
        index: i + 1,
        title: scene.title,
        prompt: scene.prompt,
        imageUrl,
        imageCloudinaryPublicId,
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

    const journeyLinkId = state.trainingJourneyId ? toObjectIdOrUndefined(state.trainingJourneyId) : undefined;
    if (journeyLinkId && imageSetId) {
      try {
        await TrainingJourney.findByIdAndUpdate(journeyLinkId, { $set: { images: imageSetId } });
      } catch (linkErr: any) {
        console.warn('[TrainingImages] Failed to link image set to training_journey:', linkErr?.message || linkErr);
      }
    }
  } catch (e: any) {
    console.error('[TrainingImages] Job failed', {
      jobId,
      completed: state.completed,
      total: state.total,
      error: String(e?.message || e),
      stack: e?.stack,
    });
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

export const generateQuiz = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { moduleContent, numberOfQuestions, difficulty } = req.body || {};

    const requestedCount = Number.isFinite(Number(numberOfQuestions))
      ? Math.min(Math.max(parseInt(String(numberOfQuestions), 10), 1), 30)
      : 5;

    const moduleTitle = String(moduleContent?.title || '').trim();
    const moduleDescription = String(moduleContent?.description || '').trim();
    const sectionText = Array.isArray(moduleContent?.sections)
      ? moduleContent.sections
          .map((s: any) => [String(s?.title || ''), String(s?.content || '')].join(' ').trim())
          .filter(Boolean)
          .join('\n')
      : '';

    const topicSource = [moduleTitle, moduleDescription, sectionText]
      .filter(Boolean)
      .join('\n')
      .slice(0, 6000);

    const topic = topicSource || 'training content';
    const rawQuestions = await aiService.generateQuiz(topic, requestedCount);

    const questions = Array.isArray(rawQuestions)
      ? rawQuestions
          .map((q: any) => ({
            question: String(q?.question || '').trim(),
            options: Array.isArray(q?.options)
              ? q.options.map((opt: any) => String(opt || '').trim()).filter(Boolean).slice(0, 6)
              : [],
            correctAnswer: Number.isInteger(q?.correctAnswer)
              ? Number(q.correctAnswer)
              : 0,
            explanation: String(q?.explanation || '').trim(),
            difficulty: String(difficulty || 'medium').trim().toLowerCase() || 'medium',
            type: 'multiple-choice',
          }))
          .filter((q: any) => q.question && q.options.length >= 2)
          .slice(0, requestedCount)
      : [];

    return res.json({
      success: true,
      data: {
        questions,
      },
    });
  } catch (error) {
    return next(error);
  }
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

    const sessionContext =
      activeSession.contextSnapshot && typeof activeSession.contextSnapshot === 'object'
        ? activeSession.contextSnapshot as Record<string, any>
        : null;
    const mergeFromSessionIfMissing = (key: string) => {
      const sessionValue = sessionContext?.[key];
      const currentValue = parsedContext?.[key];
      const currentMissing =
        currentValue == null ||
        (Array.isArray(currentValue) && currentValue.length === 0) ||
        (typeof currentValue === 'string' && currentValue.trim().length === 0);
      if (currentMissing && sessionValue != null) {
        parsedContext = { ...(parsedContext || {}), [key]: sessionValue };
      }
    };
    if (!parsedContext && sessionContext) {
      parsedContext = { ...sessionContext };
    } else {
      mergeFromSessionIfMissing('analyzedUploads');
      mergeFromSessionIfMissing('analyzedUploadsCount');
      mergeFromSessionIfMissing('knowledgeBaseDocuments');
      mergeFromSessionIfMissing('knowledgeBaseDocumentsCount');
      mergeFromSessionIfMissing('selectedGigId');
      mergeFromSessionIfMissing('selectedGigTitle');
      mergeFromSessionIfMissing('gigSnapshot');
      mergeFromSessionIfMissing('useKnowledgeBase');
      mergeFromSessionIfMissing('useUploadedDocuments');
      mergeFromSessionIfMissing('chatStyle');
      mergeFromSessionIfMissing('requestedOutput');
      mergeFromSessionIfMissing('requestedModuleReference');
      mergeFromSessionIfMissing('trainingJourneyId');
      mergeFromSessionIfMissing('pendingPlanSaveToken');
    }

    const selectedDuration = parsedContext?.selectedDuration || 'non specifiee';
    const selectedMethodology = parsedContext?.selectedMethodology || 'Methodologie 360';
    const isFreeChatMode = String(parsedContext?.chatStyle || '').toLowerCase() === 'free_chat';
    const requestedOutput = String(parsedContext?.requestedOutput || '').toLowerCase();
    const requestedModuleReference = String(parsedContext?.requestedModuleReference || '').trim();
    const isPlanIntent = requestedOutput === 'training_plan';
    const isModuleIntent = requestedOutput === 'module_content';
    const isFullTrainingIntent = requestedOutput === 'full_training_content';
    const requiresTypedStyle = isPlanIntent || isModuleIntent || isFullTrainingIntent;
    const inferredDomain = inferKbDomainFromContext(parsedContext);
    const effectiveContextString =
      parsedContext && typeof parsedContext === 'object'
        ? JSON.stringify(parsedContext)
        : safeContext;

    const safeTrainingJourneyId =
      toObjectIdOrUndefined(parsedContext?.trainingJourneyId) ||
      toObjectIdOrUndefined(req.body?.trainingJourneyId);
    const linkedJourney = safeTrainingJourneyId
      ? await TrainingJourney.findById(safeTrainingJourneyId)
          .select('_id modulePlan modules methodologyData')
          .lean()
      : null;
    const isPlanFrozen =
      Boolean((linkedJourney as any)?.methodologyData?.planFrozenFromChat) ||
      Boolean((linkedJourney as any)?.modulePlan?.length);
    if (parsedContext && typeof parsedContext === 'object') {
      (parsedContext as any).planValidatedFromDb = isPlanFrozen;
    }
    const savedPlanAnchor = buildSavedPlanAnchor(linkedJourney);

    const priorMessages = Array.isArray(activeSession.messages) ? activeSession.messages : [];
    const lastAssistantEntry = [...priorMessages]
      .reverse()
      .find((m: any) => String(m?.role || '').toLowerCase() === 'assistant');
    const lastAssistantPlanCandidate = String(lastAssistantEntry?.text || '').trim();
    const trimmedMessage = String(message || '').trim();
    const lastAssistantPlanSanitized = sanitizeAssistantPlanText(lastAssistantPlanCandidate);
    const isPlanPatchRequest =
      requestedOutput === 'training_plan' &&
      isPlanEditRequest(trimmedMessage) &&
      looksLikeTrainingPlanText(lastAssistantPlanSanitized);
    const pendingPlanMarkdown = String((sessionContext as any)?.pendingPlanMarkdown || '').trim();
    const pendingPlanSaveToken = String((sessionContext as any)?.pendingPlanSaveToken || '').trim();

    if (
      isJourneyBuilderApp(parsedContext) &&
      (trimmedMessage === CHAT_VALIDATE_MODULE_CONTENT_CMD ||
        trimmedMessage === CHAT_VALIDATE_ALL_MODULES_CONTENT_CMD)
    ) {
      if (!isPlanFrozen) {
        const denied = "Validation refusée : vous devez d'abord valider et enregistrer le plan.";
        return res.status(400).json({ success: false, error: denied });
      }
      const linkedJourneyId =
        toObjectIdOrUndefined(parsedContext?.trainingJourneyId) ||
        toObjectIdOrUndefined(req.body?.trainingJourneyId);
      if (!linkedJourneyId) {
        return res.status(400).json({ success: false, error: 'trainingJourneyId is required for content validation.' });
      }
      const journey = await TrainingJourney.findById(linkedJourneyId);
      if (!journey) {
        return res.status(404).json({ success: false, error: 'Journey not found.' });
      }
      const md = ((journey as any).methodologyData && typeof (journey as any).methodologyData === 'object')
        ? { ...(journey as any).methodologyData }
        : {};
      if (trimmedMessage === CHAT_VALIDATE_MODULE_CONTENT_CMD) {
        const moduleRef = String(parsedContext?.requestedModuleReference || '').trim();
        const validated = Array.isArray(md.validatedModuleContents) ? [...md.validatedModuleContents] : [];
        const item = {
          moduleReference: moduleRef || 'module',
          validatedAt: new Date().toISOString(),
        };
        validated.push(item);
        md.validatedModuleContents = validated.slice(-100);
      } else {
        md.validatedAllModulesContentAt = new Date().toISOString();
      }
      (journey as any).methodologyData = md;
      await journey.save();

      const ack =
        trimmedMessage === CHAT_VALIDATE_MODULE_CONTENT_CMD
          ? 'Contenu du module validé et enregistré.'
          : 'Contenu de tous les modules validé et enregistré.';
      activeSession.messages.push(
        { role: 'user', text: trimmedMessage, createdAt: new Date() } as any,
        { role: 'assistant', text: ack, createdAt: new Date() } as any
      );
      activeSession.lastActivityAt = new Date();
      await activeSession.save();
      const streamEnabledEarly = String(req.query.stream ?? 'true').toLowerCase() !== 'false';
      if (!streamEnabledEarly) {
        return res.status(200).json({
          success: true,
          response: ack,
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
      res.write(ack);
      return res.end();
    }

    const confirmPlanCmd = message.trim().match(CHAT_CONFIRM_PLAN_CMD_REGEX);
    if (isJourneyBuilderApp(parsedContext) && confirmPlanCmd && pendingPlanMarkdown) {
      const tokenFromCmd = String(confirmPlanCmd[1] || '').trim();
      if (pendingPlanSaveToken && tokenFromCmd && pendingPlanSaveToken !== tokenFromCmd) {
        return res.status(400).json({ success: false, error: 'Invalid confirmation token.' });
      }
      let planSavedJourneyId: string | undefined;
      let ack = '';
      try {
        const result = await persistValidatedChatPlan({
          planMarkdown: pendingPlanMarkdown,
          trainingJourneyId: toObjectIdOrUndefined(parsedContext?.trainingJourneyId),
          gigId: safeGigId,
          companyId: safeCompanyId,
          parsedContext,
          userMessage: 'confirm_plan_button',
        });
        planSavedJourneyId = result.journeyId;
        ack = result.ackFr;
      } catch (e: any) {
        ack = `Impossible d'enregistrer le plan : ${String(e?.message || 'erreur')}`;
      }
      const userMessageText = message.trim();
      activeSession.messages.push(
        { role: 'user', text: userMessageText, createdAt: new Date() } as any,
        { role: 'assistant', text: ack, createdAt: new Date() } as any
      );
      if (planSavedJourneyId && parsedContext && typeof parsedContext === 'object') {
        (parsedContext as any).trainingJourneyId = planSavedJourneyId;
      }
      activeSession.contextSnapshot =
        parsedContext && typeof parsedContext === 'object'
          ? {
              analyzedUploadsCount: parsedContext.analyzedUploadsCount,
              analyzedUploads: parsedContext.analyzedUploads,
              knowledgeBaseDocumentsCount: parsedContext.knowledgeBaseDocumentsCount,
              knowledgeBaseDocuments: parsedContext.knowledgeBaseDocuments,
              selectedGigId: parsedContext.selectedGigId,
              selectedGigTitle: parsedContext.selectedGigTitle,
              gigSnapshot: parsedContext.gigSnapshot,
              useKnowledgeBase: parsedContext.useKnowledgeBase,
              useUploadedDocuments: parsedContext.useUploadedDocuments,
              chatStyle: parsedContext.chatStyle,
              requestedOutput: parsedContext.requestedOutput,
              requestedModuleReference: parsedContext.requestedModuleReference,
              trainingJourneyId: (parsedContext as any)?.trainingJourneyId,
            }
          : activeSession.contextSnapshot || null;
      if (!activeSession.title || activeSession.title === 'Nouvelle conversation') {
        activeSession.title = buildSessionTitle(userMessageText);
      }
      activeSession.lastActivityAt = new Date();
      await activeSession.save();

      const streamEnabledEarly = String(req.query.stream ?? 'true').toLowerCase() !== 'false';
      if (!streamEnabledEarly) {
        return res.status(200).json({
          success: true,
          response: ack,
          sessionId: String(activeSession._id),
          planSaved: Boolean(planSavedJourneyId),
          journeyId: planSavedJourneyId,
        });
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('X-Chat-Session-Id', String(activeSession._id));
      if (planSavedJourneyId) {
        res.setHeader('X-Plan-Saved', '1');
        res.setHeader('X-Saved-Journey-Id', planSavedJourneyId);
      }
      res.status(200);
      if (typeof (res as any).flushHeaders === 'function') {
        (res as any).flushHeaders();
      }
      res.write(ack);
      return res.end();
    }

    if (
      isJourneyBuilderApp(parsedContext) &&
      isPlanAffirmationMessage(message.trim()) &&
      looksLikeTrainingPlanText(lastAssistantPlanCandidate)
    ) {
      const confirmToken = crypto.randomBytes(10).toString('hex');
      const ack = [
        'Plan détecté comme accepté.',
        'Cliquez sur le bouton pour confirmer l’enregistrement.',
        '',
        `<harx-plan-confirm>{"token":"${confirmToken}","label":"Confirmer le plan"}</harx-plan-confirm>`,
      ].join('\n');
      const userMessageText = message.trim();
      activeSession.messages.push(
        { role: 'user', text: userMessageText, createdAt: new Date() } as any,
        { role: 'assistant', text: ack, createdAt: new Date() } as any
      );
      activeSession.contextSnapshot =
        parsedContext && typeof parsedContext === 'object'
          ? {
              analyzedUploadsCount: parsedContext.analyzedUploadsCount,
              analyzedUploads: parsedContext.analyzedUploads,
              knowledgeBaseDocumentsCount: parsedContext.knowledgeBaseDocumentsCount,
              knowledgeBaseDocuments: parsedContext.knowledgeBaseDocuments,
              selectedGigId: parsedContext.selectedGigId,
              selectedGigTitle: parsedContext.selectedGigTitle,
              gigSnapshot: parsedContext.gigSnapshot,
              useKnowledgeBase: parsedContext.useKnowledgeBase,
              useUploadedDocuments: parsedContext.useUploadedDocuments,
              chatStyle: parsedContext.chatStyle,
              requestedOutput: parsedContext.requestedOutput,
              requestedModuleReference: parsedContext.requestedModuleReference,
              trainingJourneyId: (parsedContext as any)?.trainingJourneyId,
              pendingPlanMarkdown: lastAssistantPlanCandidate,
              pendingPlanSaveToken: confirmToken,
            }
          : activeSession.contextSnapshot || null;
      if (!activeSession.title || activeSession.title === 'Nouvelle conversation') {
        activeSession.title = buildSessionTitle(userMessageText);
      }
      activeSession.lastActivityAt = new Date();
      await activeSession.save();

      const streamEnabledEarly = String(req.query.stream ?? 'true').toLowerCase() !== 'false';
      if (!streamEnabledEarly) {
        return res.status(200).json({
          success: true,
          response: ack,
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
      res.write(ack);
      return res.end();
    }

    if (
      isJourneyBuilderApp(parsedContext) &&
      isPlanFrozen &&
      requestedOutput === 'training_plan' &&
      isPlanEditRequest(message.trim())
    ) {
      const lockMsg =
        "Le plan de formation est déjà enregistré et verrouillé. L'édition n'est plus autorisée ici. Vous pouvez demander le contenu d'un module existant du plan sauvegardé.";
      activeSession.messages.push(
        { role: 'user', text: message.trim(), createdAt: new Date() } as any,
        { role: 'assistant', text: lockMsg, createdAt: new Date() } as any
      );
      activeSession.lastActivityAt = new Date();
      await activeSession.save();
      const streamEnabledEarly = String(req.query.stream ?? 'true').toLowerCase() !== 'false';
      if (!streamEnabledEarly) {
        return res.status(200).json({
          success: true,
          response: lockMsg,
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
      res.write(lockMsg);
      return res.end();
    }

    const gigGrounding = await buildGigGroundingBlocks(safeGigId, parsedContext);

    const prompt = [
      'HARX conversation context:',
      effectiveContextString,
      gigGrounding.promptAppend,
      savedPlanAnchor,
      isPlanPatchRequest
        ? `\n--- CURRENT PLAN TO PATCH (KEEP OTHER MODULES UNCHANGED) ---\n${lastAssistantPlanSanitized.slice(0, 15000)}\n`
        : '',
      '',
      'User message:',
      message.trim()
    ].join('\n');

    const systemPrompt = [
      'You are HARX AI. Reply in the user language. Be simple, clear, pedagogical.',
      'Use markdown only. Never output HTML/CSS/JS or fake UI buttons.',
      'Keep business context from conversation unless user changes it.',
      'If critical info is missing, infer reasonably and ask max 2 focused questions at the end.',
      inferredDomain.strictTopicGuard,
      ...(gigGrounding.systemRules.length
        ? gigGrounding.systemRules
        : ['Do not invent company/gig context not provided by user.']),
      isFreeChatMode
        ? 'FREE CHAT MODE: natural concise assistant style. Do not force module structures unless user explicitly asks plan/training/module.'
        : '',
      requestedOutput === 'training_plan'
        ? [
            'INTENT LOCK: TRAINING PLAN',
            isPlanPatchRequest
              ? 'PLAN PATCH MODE: modify only the module(s) explicitly requested by the user. Keep all other existing modules unchanged (same order, same titles, same content).'
              : '',
            isPlanPatchRequest
              ? 'If user references module position (for example "module 2"), map it to the corresponding saved plan module index. If ambiguous, ask one clarifying question before patching.'
              : '',
            isPlanPatchRequest
              ? 'Return the full plan after patching, but do not regenerate untouched modules.'
              : '',
            'Output only a plan (no full lessons), start directly at Module 1.',
            'Minimum 4 modules, progressive from basic to advanced.',
            'Use short dash bullets only ("- "), title-like phrases, no long sentences, no numbering.',
            'Each module must include: 🎯 Objectifs, 📌 Key Topics, 🧩 Activites, 📊 Indicateur d\'evaluation.',
            'Use module emojis in order: 🟢 Module 1, 🟡 Module 2, 🟠 Module 3, 🔵 Module 4.',
            'Nested format allowed: "- 📌 1.1 Sous-theme" then indented "  - item".',
            'No intro paragraph, no clarification questions before modules.',
          ].join('\n')
        : '',
      requestedOutput === 'full_training_content'
        ? [
            'INTENT LOCK: FULL TRAINING CONTENT',
            isPlanFrozen
              ? 'PLAN LOCK: use ONLY modules and scope from the saved training plan provided in context. Do not add, rename, or reorder modules.'
              : '',
            'Generate complete learner-facing content for all modules.',
            'Per module include: Title, Objectives, Detailed Explanation, Examples, Hands-on Exercise, Mini Quiz (3-5), Summary, Reflection, Self-assessment (1-5).',
            'Keep each module under 800 words; if more depth is needed, ask which module to expand.',
          ].join('\n')
        : '',
      requestedOutput === 'module_content'
        ? [
            `INTENT LOCK: MODULE CONTENT${requestedModuleReference ? ` (${requestedModuleReference})` : ''}`,
            isPlanFrozen
              ? 'PLAN LOCK: the requested module must match an existing module from the saved plan. If not found, ask user to choose one saved module title.'
              : '',
            'Generate only the requested module.',
            'Include: Module Title, Learning Objectives, Deep Explanation, Examples, Practical Exercise, Quick Quiz (3-5), Self-Assessment, Skill Validation, Success/Failure indicator.',
            'Keep content under 600 words for a single module.',
            'Include one self-check with model answer or reflection prompt.',
          ].join('\n')
        : '',
      requiresTypedStyle
        ? 'Append exactly one <harx-style>{...}</harx-style> JSON block at the end.'
        : '',
      isPlanIntent
        ? 'Style profile plan: layout cards, clean and structured.'
        : '',
      isModuleIntent
        ? 'Style profile module: editorial, focused and deep.'
        : '',
      isFullTrainingIntent
        ? 'Style profile full training: minimal, high readability.'
        : '',
    ].filter(Boolean).join('\n');

    const isWeakPlanDraft = (value: string): boolean => {
      const txt = String(value || '').trim();
      if (!txt) return true;
      const moduleHits = (txt.match(/module\s*\d+/gi) || []).length;
      const lineCount = txt.split('\n').filter((l) => l.trim()).length;
      const startsWithQuestion = /^\s*(avant|pour commencer|j['’]ai besoin|peux-tu|quel|quelle|quels|quelles)\b/i.test(txt);
      const questionMarks = (txt.match(/\?/g) || []).length;
      const hasObjectives = /(learning objectives|objectifs? d['’]apprentissage|objectifs?)/i.test(txt);
      const hasTopics = /(key topics|th[eè]mes cl[eé]s|sujets cl[eé]s|topics)/i.test(txt);
      const hasPractice = /(practice activity|activit[eé] pratique|mise en pratique|atelier)/i.test(txt);
      const hasEvaluation = /(evaluation indicator|indicateur d['’]?[eé]valuation|crit[eè]re d['’]?[eé]valuation)/i.test(txt);
      const bulletLines = txt
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^[-*•]\s+/.test(l));
      const longSentenceBullets = bulletLines.filter((l) => {
        const body = l.replace(/^[-*•]\s+/, '').trim();
        const wordCount = body.split(/\s+/).filter(Boolean).length;
        const hasTerminalPunctuation = /[.!?]\s*$/.test(body);
        return wordCount > 14 || hasTerminalPunctuation;
      }).length;
      const numberedListLines = txt
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^\d+[.)]\s+/.test(l)).length;
      const normalizedBullets = bulletLines
        .map((l) => l.replace(/^[-*•]\s+/, '').trim().toLowerCase())
        .filter(Boolean);
      const bulletPrefixes = normalizedBullets.map((b) => b.split(/\s+/).slice(0, 3).join(' '));
      const prefixCounts = bulletPrefixes.reduce((acc, p) => {
        acc[p] = (acc[p] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const repetitivePrefixDetected = Object.values(prefixCounts).some((count) => count >= 3);
      return moduleHits < 2 || lineCount < 8 || startsWithQuestion || questionMarks >= 4 || !hasObjectives || !hasTopics || !hasPractice || !hasEvaluation || longSentenceBullets >= 2 || numberedListLines >= 2 || repetitivePrefixDetected;
    };

    const buildStylePresetByIntent = (intent: string) => {
      if (intent === 'training_plan') {
        return {
          layoutPreset: 'cards',
          titleColor: '#0f2744',
          accentColor: '#0ea5a0',
          typography: {
            bodyFont: 'Inter, system-ui, sans-serif',
            headingFont: '"Segoe UI", Inter, system-ui, sans-serif',
          },
          moduleCardThemes: [
            { bg: '#eafbf5', border: '#9ddfc8', text: '#153427' },
            { bg: '#ecf8ff', border: '#9ecde7', text: '#163043' },
            { bg: '#f3f1ff', border: '#c2b9ef', text: '#2a2352' },
            { bg: '#fff5eb', border: '#efc998', text: '#402a12' },
          ],
          contentTheme: {
            bodyColor: '#1c2a33',
            headingColor: '#0f2138',
            tableBorder: '#c9e4de',
            tableHeaderBg: '#e6f8f4',
            tableHeaderText: '#10313a',
            tableRowBg: '#f9fffd',
            kpiBg: '#ecfbf7',
            kpiBorder: '#c8ece1',
            kpiLabel: '#2f6f67',
            kpiValue: '#11353b',
            moduleShape: 'soft',
            panelBg: '#f4fffc',
            panelBorder: '#cdece4',
            badgeBg: '#e5f8f2',
            badgeText: '#0f766e',
            canvasBg: '#ffffff',
          },
        };
      }
      if (intent === 'module_content') {
        return {
          layoutPreset: 'editorial',
          titleColor: '#1f2a44',
          accentColor: '#6366f1',
          typography: {
            bodyFont: '"Source Sans 3", "Segoe UI", sans-serif',
            headingFont: '"Merriweather", "Segoe UI", serif',
          },
          moduleCardThemes: [
            { bg: '#f2f5ff', border: '#b8c8f5', text: '#1b2a4a' },
            { bg: '#eef8ff', border: '#b8d8ee', text: '#1a3347' },
            { bg: '#f7f2ff', border: '#d0baf0', text: '#34244f' },
            { bg: '#fff5f7', border: '#efbfd0', text: '#4a2030' },
          ],
          contentTheme: {
            bodyColor: '#1f2d3f',
            headingColor: '#112241',
            tableBorder: '#d1d9ee',
            tableHeaderBg: '#eaf0ff',
            tableHeaderText: '#13274a',
            tableRowBg: '#fbfcff',
            kpiBg: '#eef2ff',
            kpiBorder: '#d4dcf4',
            kpiLabel: '#4d5f95',
            kpiValue: '#1a2d4d',
            moduleShape: 'rounded',
            panelBg: '#f8faff',
            panelBorder: '#d8e0f6',
            badgeBg: '#e8eeff',
            badgeText: '#3949ab',
            canvasBg: '#ffffff',
          },
        };
      }
      return {
        layoutPreset: 'minimal',
        titleColor: '#1b2238',
        accentColor: '#f59e0b',
        typography: {
          bodyFont: '"Trebuchet MS", "Segoe UI", sans-serif',
          headingFont: '"Trebuchet MS", "Segoe UI", sans-serif',
        },
        moduleCardThemes: [
          { bg: '#fff8ea', border: '#efd7aa', text: '#352814' },
          { bg: '#fff2df', border: '#efc58b', text: '#3c260f' },
          { bg: '#fff9f1', border: '#ebd4b2', text: '#362918' },
          { bg: '#f5f9ed', border: '#cfe2a5', text: '#25341a' },
        ],
        contentTheme: {
          bodyColor: '#2d2419',
          headingColor: '#1a2440',
          tableBorder: '#e7d9bd',
          tableHeaderBg: '#fff3de',
          tableHeaderText: '#2a2218',
          tableRowBg: '#fffaf2',
          kpiBg: '#fff6e9',
          kpiBorder: '#ecd8b3',
          kpiLabel: '#8b6a32',
          kpiValue: '#2e2618',
          moduleShape: 'soft',
          panelBg: '#fffbf3',
          panelBorder: '#ecdab8',
          badgeBg: '#fff1da',
          badgeText: '#b86f09',
          canvasBg: '#fffdf8',
        },
      };
    };

    const enforceHarxStyleByIntent = (raw: string, intent: string): string => {
      if (!(intent === 'training_plan' || intent === 'module_content' || intent === 'full_training_content')) {
        return String(raw || '');
      }
      const text = String(raw || '').trim();
      const preset = buildStylePresetByIntent(intent);
      const styleBlock = `<harx-style>${JSON.stringify(preset)}</harx-style>`;
      if (!text) return styleBlock;
      const withoutExisting = text.replace(/<harx-style>[\s\S]*?<\/harx-style>/gi, '').trim();
      return `${withoutExisting}\n\n${styleBlock}`;
    };

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
      if (isPlanIntent && isWeakPlanDraft(String(response || ''))) {
        const correctivePlanPrompt = `${systemPrompt}
HARD PLAN ENFORCEMENT:
Regenerate now with strict compliance.
- Start at 🟢 Module 1
- Minimum 4 modules, progressive
- Per module: 🎯 Objectifs, 📌 Key Topics, 🧩 Activites, 📊 Indicateur d'evaluation
- Dash bullets only, short title-like phrases, no numbered lists
- Use module emojis in order: 🟢 🟡 🟠 🔵
- No intro, no questions, no long explanations`;
        response = await aiService.generateWithClaude(prompt, correctivePlanPrompt, anthropicKey);
      }
      let finalResponse = await ensureVisualResponseContract(
        String(response || ''),
        selectedDuration,
        selectedMethodology,
        message.trim(),
        anthropicKey
      );
      finalResponse = enforceHarxStyleByIntent(finalResponse, requestedOutput);

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
      activeSession.contextSnapshot = parsedContext && typeof parsedContext === 'object'
        ? {
            analyzedUploadsCount: parsedContext.analyzedUploadsCount,
            analyzedUploads: parsedContext.analyzedUploads,
            knowledgeBaseDocumentsCount: parsedContext.knowledgeBaseDocumentsCount,
            knowledgeBaseDocuments: parsedContext.knowledgeBaseDocuments,
            selectedGigId: parsedContext.selectedGigId,
            selectedGigTitle: parsedContext.selectedGigTitle,
            gigSnapshot: parsedContext.gigSnapshot,
            useKnowledgeBase: parsedContext.useKnowledgeBase,
            useUploadedDocuments: parsedContext.useUploadedDocuments,
            chatStyle: parsedContext.chatStyle,
            requestedOutput: parsedContext.requestedOutput,
            requestedModuleReference: parsedContext.requestedModuleReference,
            trainingJourneyId: (parsedContext as any)?.trainingJourneyId,
          }
        : activeSession.contextSnapshot || null;
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
    const forceLockedIntentResponse = isPlanIntent || isModuleIntent || isFullTrainingIntent;
    if (shouldValidateDomain || forceLockedIntentResponse) {
      // For strict domain lock, generate once then stream-safe write validated content.
      let response = await aiService.generateWithClaude(prompt, systemPrompt, anthropicKey);
      if (isKbTopicMismatch(String(response || ''), inferredDomain.kbKeywords)) {
        const correctiveSystemPrompt = `${systemPrompt} CRITICAL DOMAIN LOCK: ${inferredDomain.strictTopicGuard} If draft is off-domain, regenerate fully in the correct domain.`;
        response = await aiService.generateWithClaude(prompt, correctiveSystemPrompt, anthropicKey);
      }
      if (isPlanIntent && isWeakPlanDraft(String(response || ''))) {
        const correctivePlanPrompt = `${systemPrompt}
HARD PLAN ENFORCEMENT:
Regenerate now with strict compliance.
- Start at 🟢 Module 1
- Minimum 4 modules, progressive
- Per module: 🎯 Objectifs, 📌 Key Topics, 🧩 Activites, 📊 Indicateur d'evaluation
- Dash bullets only, short title-like phrases, no numbered lists
- Use module emojis in order: 🟢 🟡 🟠 🔵
- No intro, no questions, no long explanations`;
        response = await aiService.generateWithClaude(prompt, correctivePlanPrompt, anthropicKey);
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
    assistantMessageText = enforceHarxStyleByIntent(assistantMessageText, requestedOutput);
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
    activeSession.contextSnapshot = parsedContext && typeof parsedContext === 'object'
      ? {
          analyzedUploadsCount: parsedContext.analyzedUploadsCount,
          analyzedUploads: parsedContext.analyzedUploads,
          knowledgeBaseDocumentsCount: parsedContext.knowledgeBaseDocumentsCount,
          knowledgeBaseDocuments: parsedContext.knowledgeBaseDocuments,
          selectedGigId: parsedContext.selectedGigId,
          selectedGigTitle: parsedContext.selectedGigTitle,
          gigSnapshot: parsedContext.gigSnapshot,
          useKnowledgeBase: parsedContext.useKnowledgeBase,
          useUploadedDocuments: parsedContext.useUploadedDocuments,
          chatStyle: parsedContext.chatStyle,
          requestedOutput: parsedContext.requestedOutput,
          requestedModuleReference: parsedContext.requestedModuleReference,
          trainingJourneyId: (parsedContext as any)?.trainingJourneyId,
        }
      : activeSession.contextSnapshot || null;
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
          trainingJourneyId: session?.contextSnapshot?.trainingJourneyId
            ? String(session.contextSnapshot.trainingJourneyId)
            : undefined,
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
        trainingJourneyId: (session as any)?.contextSnapshot?.trainingJourneyId
          ? String((session as any).contextSnapshot.trainingJourneyId)
          : undefined,
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
      trainingJourneyId,
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

    const journeyIdForLink = String(trainingJourneyId || '').trim();
    const safeJourneyId = mongoose.Types.ObjectId.isValid(journeyIdForLink)
      ? new mongoose.Types.ObjectId(journeyIdForLink)
      : null;
    if (safeJourneyId) {
      try {
        await TrainingJourney.findByIdAndUpdate(safeJourneyId, { $set: { podcast: saved._id } });
      } catch (linkErr: any) {
        console.warn('[savePodcast] Failed to link podcast to training_journey:', linkErr?.message || linkErr);
      }
    }

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
    const renderModeRaw = String(req.body?.renderMode || 'ai_images').trim().toLowerCase();
    const renderMode: 'ai_images' | 'template_slides' =
      renderModeRaw === 'template_slides' ? 'template_slides' : 'ai_images';
    const maxImages = Math.min(Math.max(Number(req.body?.maxImages || 8), 1), 20);
    const defaultSuffix = renderMode === 'template_slides' ? 'Slides' : 'Images';
    const title = String(req.body?.title || `${trainingTitle || 'Training'} - ${defaultSuffix}`).trim().slice(0, 240);
    const safeGigId = toObjectIdOrUndefined(req.body?.gigId);
    const safeCompanyId = toObjectIdOrUndefined(req.body?.companyId);
    const trainingJourneyIdRaw = String(req.body?.trainingJourneyId || '').trim();
    const trainingJourneyId = mongoose.Types.ObjectId.isValid(trainingJourneyIdRaw)
      ? trainingJourneyIdRaw
      : undefined;
    if (!trainingDigest) {
      return res.status(400).json({ success: false, error: 'trainingDigest is required' });
    }

    const storyboard = await buildImageStoryboardFromDigest({
      trainingDigest,
      trainingTitle,
      language,
      maxImages,
      styleGuidance,
      renderMode,
    });
    const jobId = crypto.randomUUID();
    const now = Date.now();
    const state: TrainingImageGenerationJobState = {
      id: jobId,
      status: 'queued',
      renderMode,
      title,
      trainingTitle: trainingTitle || undefined,
      language,
      trainingJourneyId,
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
      renderMode: state.renderMode,
      total: state.total,
      completed: state.completed,
      items: state.items,
    });
  } catch (error) {
    return next(error);
  }
};

export const generateTrainingSlidesJson = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const trainingDigest = String(req.body?.trainingDigest || '').trim();
    const trainingTitle = String(req.body?.trainingTitle || '').trim();
    const language = String(req.body?.language || 'fr').trim().toLowerCase() || 'fr';
    const maxSlides = Math.min(Math.max(Number(req.body?.maxSlides || 12), 3), 30);
    const generator = String(req.body?.generator || 'ai').trim().toLowerCase();
    const withCoverImage = req.body?.withCoverImage !== false;
    if (!trainingDigest) {
      return res.status(400).json({ success: false, error: 'trainingDigest is required' });
    }
    let structured: { title: string; language: string; theme: StructuredTrainingTheme; slides: StructuredTrainingSlide[] };
    if (generator === 'deterministic') {
      structured = buildStructuredSlidesFromDigest({
        trainingDigest,
        trainingTitle,
        language,
        maxSlides,
      });
    } else {
      const anthropicKey =
        String(req.headers['x-anthropic-api-key'] || '').trim() ||
        String(req.body?.anthropicApiKey || '').trim() ||
        undefined;
      try {
        structured = await generateStructuredSlidesWithClaude({
          trainingDigest,
          trainingTitle,
          language,
          maxSlides,
          anthropicKey,
        });
      } catch (aiErr: any) {
        throw new AppError(
          `Claude structured slides generation failed: ${String(aiErr?.message || aiErr)}`,
          502
        );
      }
    }
    if (withCoverImage && Array.isArray(structured.slides) && structured.slides.length > 0) {
      const first = structured.slides[0];
      const coverAsset = await generateStructuredCoverImage({
        title: structured.title || first?.title || trainingTitle || 'Formation',
        language: structured.language || language,
        bullets: Array.isArray(first?.bullets) ? first.bullets : [],
      });
      structured.theme = {
        ...structured.theme,
        ...coverAsset,
      };
    }
    return res.json({
      success: true,
      generator: generator === 'deterministic' ? 'deterministic' : 'ai',
      title: structured.title,
      language: structured.language,
      theme: structured.theme,
      slides: structured.slides,
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
      renderMode: state.renderMode,
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
        renderMode: String(r.renderMode || 'ai_images') as 'ai_images' | 'template_slides',
        gigId: r.gigId ? String(r.gigId) : undefined,
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

export const saveTrainingImageSet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const imageSetId = String(req.body?.imageSetId || '').trim();
    const title = String(req.body?.title || '').trim().slice(0, 240);
    const trainingTitle = String(req.body?.trainingTitle || '').trim().slice(0, 280);
    const language = String(req.body?.language || 'fr').trim().toLowerCase() || 'fr';
    const renderModeRaw = String(req.body?.renderMode || 'ai_images').trim().toLowerCase();
    const renderMode: 'ai_images' | 'template_slides' =
      renderModeRaw === 'template_slides' ? 'template_slides' : 'ai_images';
    const safeGigId = toObjectIdOrUndefined(req.body?.gigId);
    const safeCompanyId = toObjectIdOrUndefined(req.body?.companyId);
    const safeJourneyId = toObjectIdOrUndefined(req.body?.trainingJourneyId);
    const incomingItems = Array.isArray(req.body?.items) ? req.body.items : [];
    const items = incomingItems
      .map((it: any, idx: number) => ({
        index: Number.isFinite(Number(it?.index)) ? Number(it.index) : idx + 1,
        title: String(it?.title || '').trim().slice(0, 200),
        prompt: String(it?.prompt || '').trim().slice(0, 1200),
        imageUrl: String(it?.imageUrl || '').trim(),
        imageCloudinaryPublicId: String(it?.imageCloudinaryPublicId || '').trim() || undefined,
      }))
      .filter((it: any) => it.title && it.prompt && it.imageUrl)
      .slice(0, 20)
      .map((it: any, idx: number) => ({ ...it, index: idx + 1 }));

    if (!title) return res.status(400).json({ success: false, error: 'title is required' });

    const safeId = toObjectIdOrUndefined(imageSetId);
    let doc: any = null;
    if (safeId) {
      doc = await TrainingImageSet.findById(safeId);
    }
    if (!doc) {
      doc = await TrainingImageSet.create({
        gigId: safeGigId,
        companyId: safeCompanyId,
        title,
        trainingTitle: trainingTitle || undefined,
        language,
        renderMode,
        items,
      });
    } else {
      const previousItems = Array.isArray(doc.items) ? doc.items : [];
      const removedPublicIds = previousItems
        .map((it: any) => String(it?.imageCloudinaryPublicId || '').trim())
        .filter(Boolean)
        .filter((publicId: string) => !items.some((next: any) => String(next?.imageCloudinaryPublicId || '').trim() === publicId));
      for (const publicId of removedPublicIds) {
        try {
          await cloudinaryService.deleteFile(publicId);
        } catch (e) {
          console.warn('[saveTrainingImageSet] cloudinary delete failed:', publicId, e);
        }
      }
      doc.title = title;
      doc.trainingTitle = trainingTitle || undefined;
      doc.language = language;
      doc.renderMode = renderMode;
      doc.items = items;
      if (safeGigId) doc.gigId = safeGigId;
      if (safeCompanyId) doc.companyId = safeCompanyId;
      await doc.save();
    }

    if (safeJourneyId) {
      await TrainingJourney.updateOne(
        { _id: safeJourneyId },
        { $set: { images: doc._id, updatedAt: new Date() } }
      );
    }

    return res.json({
      success: true,
      imageSet: {
        _id: String(doc._id),
        title: String(doc.title || ''),
        trainingTitle: doc.trainingTitle ? String(doc.trainingTitle) : undefined,
        renderMode: String(doc.renderMode || 'ai_images'),
        language: String(doc.language || 'fr'),
        gigId: doc.gigId ? String(doc.gigId) : undefined,
        items: Array.isArray(doc.items)
          ? doc.items.map((it: any) => ({
              index: Number(it.index || 0),
              title: String(it.title || ''),
              prompt: String(it.prompt || ''),
              imageUrl: String(it.imageUrl || ''),
              imageCloudinaryPublicId: it.imageCloudinaryPublicId ? String(it.imageCloudinaryPublicId) : undefined,
            }))
          : [],
        createdAt: doc.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const saveStructuredSlides = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const slidesSetId = String(req.body?.slidesSetId || '').trim();
    const title = String(req.body?.title || '').trim().slice(0, 240);
    const language = String(req.body?.language || 'fr').trim().toLowerCase() || 'fr';
    const theme = req.body?.theme && typeof req.body.theme === 'object' ? req.body.theme : undefined;
    const safeGigId = toObjectIdOrUndefined(req.body?.gigId);
    const safeCompanyId = toObjectIdOrUndefined(req.body?.companyId);
    const safeJourneyId = toObjectIdOrUndefined(req.body?.trainingJourneyId);
    const slides = Array.isArray(req.body?.slides)
      ? req.body.slides
          .map((s: any, idx: number) => ({
            index: Number.isFinite(Number(s?.index)) ? Number(s.index) : idx + 1,
            kind: String(s?.kind || 'content'),
            layout: s?.layout ? String(s.layout) : undefined,
            title: String(s?.title || '').trim().slice(0, 240),
            bullets: Array.isArray(s?.bullets)
              ? s.bullets.map((b: any) => String(b || '').trim()).filter(Boolean).slice(0, 20)
              : [],
            notes: s?.notes ? String(s.notes).trim().slice(0, 4000) : undefined,
            blocks: Array.isArray(s?.blocks) ? s.blocks.slice(0, 24) : undefined,
          }))
          .filter((s: any) => s.title)
          .slice(0, 40)
          .map((s: any, idx: number) => ({ ...s, index: idx + 1 }))
      : [];

    if (!title) return res.status(400).json({ success: false, error: 'title is required' });

    const safeId = toObjectIdOrUndefined(slidesSetId);
    let doc: any = null;
    if (safeId) {
      doc = await StructuredTrainingSlides.findById(safeId);
    }
    if (!doc) {
      doc = await StructuredTrainingSlides.create({
        gigId: safeGigId,
        companyId: safeCompanyId,
        trainingJourneyId: safeJourneyId,
        title,
        language,
        theme,
        slides,
      });
    } else {
      doc.title = title;
      doc.language = language;
      doc.theme = theme;
      doc.slides = slides;
      if (safeGigId) doc.gigId = safeGigId;
      if (safeCompanyId) doc.companyId = safeCompanyId;
      if (safeJourneyId) doc.trainingJourneyId = safeJourneyId;
      await doc.save();
    }

    return res.json({
      success: true,
      slidesSet: {
        _id: String(doc._id),
        title: String(doc.title || ''),
        language: String(doc.language || 'fr'),
        theme: doc.theme || undefined,
        slides: Array.isArray(doc.slides) ? doc.slides : [],
        gigId: doc.gigId ? String(doc.gigId) : undefined,
        companyId: doc.companyId ? String(doc.companyId) : undefined,
        trainingJourneyId: doc.trainingJourneyId ? String(doc.trainingJourneyId) : undefined,
        createdAt: doc.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
};
