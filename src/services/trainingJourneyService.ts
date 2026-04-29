import crypto from 'crypto';
import mongoose from 'mongoose';
import TrainingJourney, { ITrainingJourney } from '../models/TrainingJourney';
import RepProgress from '../models/RepProgress';
import RepTrainingTracking, {
  REP_TRAINING_TRACKING_EVENTS,
  RepTrainingTrackingEventKind
} from '../models/RepTrainingTracking';
import Rep from '../models/Rep';
import { AppError } from '../middleware/errorHandler';
import { ImageGenerationService } from './imageGenerationService';

function requireObjectId(raw: unknown, label: string): mongoose.Types.ObjectId {
  const s = String(raw ?? '').trim();
  if (!mongoose.Types.ObjectId.isValid(s)) {
    throw new AppError(`Invalid ${label} (expected a Mongo ObjectId)`, 400);
  }
  return new mongoose.Types.ObjectId(s);
}

function countSlidesOnJourney(j: { presentation?: { slides?: unknown } } | null | undefined): number {
  const slides = j?.presentation?.slides;
  return Array.isArray(slides) ? slides.length : 0;
}

/** Assigne un _id Mongo à chaque slide qui n’en a pas (présentation persistée). */
export function ensurePresentationSlideIdsOnSlides(slides: unknown[] | null | undefined): boolean {
  if (!Array.isArray(slides)) return false;
  let changed = false;
  for (const slide of slides) {
    if (!slide || typeof slide !== 'object') continue;
    const s = slide as { _id?: unknown; slideId?: unknown };
    const raw = s._id ?? s.slideId;
    const ok = raw != null && mongoose.Types.ObjectId.isValid(String(raw));
    if (!ok) {
      (slide as { _id: mongoose.Types.ObjectId })._id = new mongoose.Types.ObjectId();
      changed = true;
    }
  }
  return changed;
}

function countCompletedInTrackingSlides(track: Record<string, unknown> | null | undefined): number {
  const raw = track?.slides as unknown;
  if (!raw || typeof raw !== 'object') return 0;
  if (raw instanceof Map) {
    let n = 0;
    for (const v of raw.values()) {
      if (v && typeof v === 'object' && (v as { completed?: boolean }).completed === true) n += 1;
    }
    return n;
  }
  return Object.values(raw as Record<string, { completed?: boolean }>).filter((v) => v?.completed === true)
    .length;
}

function normalizeSlideIdForTracking(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'object' && raw !== null && '$oid' in raw) {
    const s = String((raw as { $oid: string }).$oid).trim();
    return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s).toString() : '';
  }
  const s = String(raw).trim();
  return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s).toString() : '';
}

function getSlideStateFromTrackingMap(
  rawSlides: unknown,
  slideIdHex: string
): { completed?: boolean } | undefined {
  if (!slideIdHex || !rawSlides || typeof rawSlides !== 'object') return undefined;
  if (rawSlides instanceof Map) {
    return rawSlides.get(slideIdHex) as { completed?: boolean } | undefined;
  }
  return (rawSlides as Record<string, { completed?: boolean }>)[slideIdHex];
}

function trackingSlidesMapHasEntries(rawSlides: unknown): boolean {
  if (!rawSlides || typeof rawSlides !== 'object') return false;
  if (rawSlides instanceof Map) return rawSlides.size > 0;
  return Object.keys(rawSlides as object).length > 0;
}

/**
 * Index 0-based de la slide à afficher au « Continue » : première slide non complétée,
 * ou dernière slide si tout est complété ; sinon repli slideIndex legacy / engagementScore.
 */
function resolveCurrentSlideIndex(
  doc: { presentation?: { slides?: unknown } } | null | undefined,
  tr: Record<string, unknown> | null | undefined,
  pr: { engagementScore?: number } | null | undefined,
  slidesTotal: number
): number {
  if (slidesTotal <= 0) return 0;
  const lastIdx = slidesTotal - 1;

  if (tr && typeof tr.slideIndex === 'number' && Number.isFinite(tr.slideIndex)) {
    const si = Math.floor(tr.slideIndex);
    return Math.min(lastIdx, Math.max(0, si));
  }

  const slides = doc?.presentation?.slides;
  if (Array.isArray(slides) && slides.length > 0 && tr && trackingSlidesMapHasEntries(tr.slides)) {
    const rawMap = tr.slides as unknown;
    for (let i = 0; i < slides.length; i++) {
      const sid = normalizeSlideIdForTracking((slides[i] as { _id?: unknown })?._id);
      const state = sid ? getSlideStateFromTrackingMap(rawMap, sid) : undefined;
      if (!state || state.completed !== true) {
        return Math.min(lastIdx, i);
      }
    }
    return lastIdx;
  }

  if (pr && typeof pr.engagementScore === 'number' && Number.isFinite(pr.engagementScore)) {
    const eng = Math.max(0, Math.min(100, Math.round(pr.engagementScore)));
    const approx = Math.round((eng / 100) * slidesTotal);
    return Math.min(lastIdx, Math.max(0, approx - 1));
  }

  return 0;
}

export type RepSlideProgressJourneyLine = {
  journeyId: string;
  journeyTitle: string;
  followedDurationMs: number;
  completedUnits: number;
  totalUnits: number;
  completedModules: number;
  totalModules: number;
  completedSections: number;
  totalSections: number;
  completedQuizzes: number;
  totalQuizzes: number;
  slidesSeen: number;
  slidesTotal: number;
  /** slidesSeen / slidesTotal (0 si pas de slides) */
  ratio: number;
  /** Index 0-based dans `presentation.slides` pour reprendre le parcours */
  currentSlideIndex: number;
};

export type RepSlideProgressSummary = {
  /** Nombre de formations prises en compte (union tracking + rep_progress) */
  trainingCount: number;
  journeys: RepSlideProgressJourneyLine[];
  /** Somme des ratios : ex. 3/15 + 2/7 */
  sumOfRatios: number;
  /** Moyenne arithmétique des ratios (score entre 0 et 1) */
  averageRatio: number;
  /** Math.round(averageRatio * 100), plafonné à 100 */
  overallPercent: number;
  /** Texte explicite pour l’UI */
  formulaHuman: string;
};

function normalizeAnyId(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'object' && raw !== null) {
    if ('$oid' in raw) return String((raw as { $oid?: unknown }).$oid || '').trim();
    if ('_id' in raw) return normalizeAnyId((raw as { _id?: unknown })._id);
    if ('id' in raw) return normalizeAnyId((raw as { id?: unknown }).id);
  }
  return String(raw).trim();
}

function toProgressModulesLookup(raw: unknown): Record<string, any> {
  if (!raw) return {};
  if (raw instanceof Map) {
    const out: Record<string, any> = {};
    for (const [k, v] of raw.entries()) out[String(k)] = v;
    return out;
  }
  if (typeof raw === 'object') return raw as Record<string, any>;
  return {};
}

function sectionProgressDoneKeys(rows: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { sectionId?: unknown; sectionKey?: unknown; status?: unknown };
    if (String(r.status || '') !== 'completed') continue;
    if (r.sectionId != null) {
      const s = String(r.sectionId).trim();
      if (mongoose.Types.ObjectId.isValid(s)) out.add(new mongoose.Types.ObjectId(s).toHexString());
      else if (s) out.add(s);
    } else if (r.sectionKey != null) {
      const sk = String(r.sectionKey).trim();
      if (mongoose.Types.ObjectId.isValid(sk)) out.add(new mongoose.Types.ObjectId(sk).toHexString());
      else if (sk) out.add(sk);
    }
  }
  return out;
}

function quizProgressPassedKeys(rows: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(rows)) return out;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { quizKey?: unknown; status?: unknown; passed?: unknown };
    const ok =
      String(r.status || '') === 'passed' ||
      (r as { passed?: boolean }).passed === true;
    if (ok && r.quizKey != null) out.add(String(r.quizKey).trim());
  }
  return out;
}

function isSectionCompleted(
  section: any,
  sectionIdx: number,
  moduleIndex: number,
  completedSectionsRaw: unknown[],
  sectionProgressRaw?: unknown
): boolean {
  const done = new Set(
    (Array.isArray(completedSectionsRaw) ? completedSectionsRaw : [])
      .map((x) => String(x || '').trim())
      .filter(Boolean)
  );
  for (const k of sectionProgressDoneKeys(sectionProgressRaw)) done.add(k);
  if (done.size === 0) return false;
  const candidates = [
    normalizeAnyId(section?._id),
    normalizeAnyId(section?.id),
    String(section?.title || '').trim(),
    `m${moduleIndex}-s${sectionIdx}`,
    `section-${sectionIdx}`,
    String(sectionIdx)
  ].filter(Boolean);
  return candidates.some((c) => done.has(c));
}

function isQuizCompleted(
  quiz: any,
  quizIdx: number,
  moduleIndex: number,
  quizScoresRaw: unknown[],
  quizProgressRaw?: unknown
): boolean {
  const passedKeys = quizProgressPassedKeys(quizProgressRaw);
  const candidates = [
    normalizeAnyId(quiz?._id),
    normalizeAnyId(quiz?.id),
    String(quiz?.title || '').trim(),
    `m${moduleIndex}-q${quizIdx}`,
    `quiz-${quizIdx}`,
    String(quizIdx)
  ].filter(Boolean);
  if (candidates.some((c) => passedKeys.has(c))) return true;

  const passed = Array.isArray(quizScoresRaw)
    ? quizScoresRaw.filter((q) => q && typeof q === 'object' && (q as { passed?: boolean }).passed === true)
    : [];
  if (passed.length === 0) return false;
  const passedIds = new Set(
    passed
      .map((q: any) => String(q?.quizId || '').trim())
      .filter(Boolean)
  );
  return candidates.some((c) => passedIds.has(c));
}

function journeyModuleMapKey(journeyModule: any, moduleIndex: number): string {
  return normalizeAnyId(journeyModule?._id) || normalizeAnyId(journeyModule?.id) || String(moduleIndex);
}

/** ObjectId de la section : `_id` du contenu si valide, sinon déterministe (hash) pour sections sans oid. */
function resolveSectionProgressObjectId(
  journeyModuleMapKey: string,
  section: any,
  sectionIdx: number
): mongoose.Types.ObjectId {
  const raw = normalizeAnyId(section?._id) || normalizeAnyId(section?.id);
  if (raw && mongoose.Types.ObjectId.isValid(raw)) {
    return new mongoose.Types.ObjectId(raw);
  }
  const seed = `${journeyModuleMapKey}:section:${sectionIdx}:${String(section?.title || '')}`;
  const h = crypto.createHash('md5').update(seed).digest('hex');
  return new mongoose.Types.ObjectId(h.slice(0, 24));
}

function stableQuizKeyFromJourneyModule(moduleIndex: number, quiz: any, quizIdx: number): string {
  const oid = normalizeAnyId(quiz?._id) || normalizeAnyId(quiz?.id);
  const title = String(quiz?.title || '').trim();
  return oid || title || `m${moduleIndex}-q${quizIdx}`;
}

function progressRowMergeKey(row: any, keyField: 'sectionId' | 'quizKey'): string {
  if (keyField === 'quizKey') {
    return String(row?.quizKey || '').trim();
  }
  if (row?.sectionId != null) {
    const s = String(row.sectionId);
    if (mongoose.Types.ObjectId.isValid(s)) return new mongoose.Types.ObjectId(s).toHexString();
  }
  const legacy = String(row?.sectionKey || '').trim();
  if (legacy && mongoose.Types.ObjectId.isValid(legacy)) {
    return new mongoose.Types.ObjectId(legacy).toHexString();
  }
  return legacy || '';
}

function buildDefaultSectionProgressRows(journeyModule: any, moduleIndex: number): any[] {
  const sections = Array.isArray(journeyModule?.sections) ? journeyModule.sections : [];
  const mk = journeyModuleMapKey(journeyModule, moduleIndex);
  return sections.map((s: any, si: number) => ({
    sectionId: resolveSectionProgressObjectId(mk, s, si),
    title: String(s?.title || '').trim() || undefined,
    status: 'pending',
    durationMs: 0,
    updatedAt: new Date()
  }));
}

function buildDefaultQuizProgressRows(journeyModule: any, moduleIndex: number): any[] {
  const quizzes = Array.isArray(journeyModule?.quizzes) ? journeyModule.quizzes : [];
  return quizzes.map((q: any, qi: number) => ({
    quizKey: stableQuizKeyFromJourneyModule(moduleIndex, q, qi),
    quizId: mongoose.Types.ObjectId.isValid(normalizeAnyId(q?._id) || normalizeAnyId(q?.id))
      ? new mongoose.Types.ObjectId(normalizeAnyId(q?._id) || normalizeAnyId(q?.id))
      : undefined,
    title: String(q?.title || '').trim() || undefined,
    status: 'pending',
    score: 0,
    attempts: 0,
    passed: false,
    durationMs: 0,
    updatedAt: new Date()
  }));
}

function mergeProgressRowsByKey<T>(existing: T[] | undefined, defaults: T[], keyField: 'sectionId' | 'quizKey'): T[] {
  const map = new Map<string, T>();
  for (const row of defaults) {
    const k = progressRowMergeKey(row as any, keyField);
    if (k) map.set(k, { ...row });
  }
  for (const row of existing || []) {
    const raw = row as any;
    let k = progressRowMergeKey(raw, keyField);
    if (keyField === 'sectionId' && !k && raw?.sectionKey && mongoose.Types.ObjectId.isValid(String(raw.sectionKey))) {
      k = new mongoose.Types.ObjectId(String(raw.sectionKey)).toHexString();
    }
    if (!k) continue;
    const cur = map.get(k) || ({} as T);
    const merged = { ...cur, ...row } as any;
    if (keyField === 'sectionId' && merged.sectionId == null && k.length === 24 && mongoose.Types.ObjectId.isValid(k)) {
      merged.sectionId = new mongoose.Types.ObjectId(k);
    }
    map.set(k, merged as T);
  }
  return [...map.values()];
}

function normalizeSectionUpdateObjectId(su: {
  sectionId?: string;
  sectionKey?: string;
  sectionMongoId?: string;
}): mongoose.Types.ObjectId | null {
  const candidates = [su.sectionId, su.sectionMongoId, su.sectionKey]
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  for (const c of candidates) {
    if (mongoose.Types.ObjectId.isValid(c)) return new mongoose.Types.ObjectId(c);
  }
  return null;
}

function upsertQuizScoresLegacy(
  quizScores: any[] | undefined,
  quizIdHex: string,
  patch: { score: number; attempts: number; passed: boolean }
): any[] {
  const list = Array.isArray(quizScores) ? [...quizScores] : [];
  const oid = new mongoose.Types.ObjectId(quizIdHex);
  const idx = list.findIndex((q) => String(q?.quizId) === String(oid));
  const row = {
    quizId: oid,
    score: Math.max(0, Math.min(100, Math.round(patch.score))),
    attempts: Math.max(0, Math.floor(patch.attempts)),
    passed: !!patch.passed
  };
  if (idx >= 0) list[idx] = { ...list[idx], ...row };
  else list.push(row);
  return list;
}

/** progress + status à partir des lignes sectionProgress / quizProgress (et completedSections legacy). */
function computeModuleProgressAndStatus(
  current: any,
  jm: any,
  jmIdx: number,
  inputProgressFallback?: number
): { progress: number; status: 'not_started' | 'in_progress' | 'completed' } {
  if (!jm) {
    const nextProgress = Math.max(
      0,
      Math.min(100, Math.round(Number(inputProgressFallback ?? current?.progress ?? 0)))
    );
    const nextStatus: 'not_started' | 'in_progress' | 'completed' =
      nextProgress >= 100 ? 'completed' : nextProgress > 0 ? 'in_progress' : 'not_started';
    return { progress: nextProgress, status: nextStatus };
  }

  const totalSections = Array.isArray(jm.sections) ? jm.sections.length : 0;
  const totalQuizzes = Array.isArray(jm.quizzes) ? jm.quizzes.length : 0;
  const hasWorkUnits = totalSections + totalQuizzes > 0;

  const jmMapKey = journeyModuleMapKey(jm, jmIdx);
  let allSectionsDone = true;
  if (totalSections > 0) {
    for (let si = 0; si < totalSections; si++) {
      const s = jm.sections[si];
      const sidHex = resolveSectionProgressObjectId(jmMapKey, s, si).toHexString();
      const row = (current.sectionProgress || []).find(
        (r: any) => progressRowMergeKey(r, 'sectionId') === sidHex
      );
      if (!row || String(row.status) !== 'completed') {
        allSectionsDone = false;
        break;
      }
    }
  } else {
    allSectionsDone = totalSections === 0;
  }

  let allQuizzesPassed = true;
  if (totalQuizzes > 0) {
    for (let qi = 0; qi < totalQuizzes; qi++) {
      const q = jm.quizzes[qi];
      const k = stableQuizKeyFromJourneyModule(jmIdx, q, qi);
      const row = (current.quizProgress || []).find((r: any) => String(r?.quizKey) === k);
      if (!row || (String(row.status) !== 'passed' && row.passed !== true)) {
        allQuizzesPassed = false;
        break;
      }
    }
  } else {
    allQuizzesPassed = totalQuizzes === 0;
  }

  let recomputedProgress = 0;
  if (totalSections > 0) {
    const nDone = (current.sectionProgress || []).filter((r: any) => String(r?.status) === 'completed')
      .length;
    recomputedProgress = Math.min(100, Math.round((nDone / totalSections) * 100));
  } else if (totalSections === 0 && totalQuizzes > 0) {
    recomputedProgress = allQuizzesPassed
      ? 100
      : Math.max(
          0,
          Math.min(100, Math.round(Number(inputProgressFallback ?? current?.progress ?? 0)))
        );
  }

  const nextProgress = hasWorkUnits
    ? recomputedProgress
    : Math.max(0, Math.min(100, Math.round(Number(inputProgressFallback ?? current?.progress ?? 0))));

  const oidDone =
    Array.isArray(current.completedSections) && current.completedSections.length > 0;
  const hasCompletedWork =
    oidDone ||
    (current.sectionProgress || []).some((r: any) => String(r?.status) === 'completed') ||
    (current.quizProgress || []).some(
      (r: any) =>
        String(r?.status) === 'passed' ||
        String(r?.status) === 'failed' ||
        (Number(r?.attempts) || 0) > 0
    );

  let nextStatus: 'not_started' | 'in_progress' | 'completed';
  if (hasWorkUnits && allSectionsDone && allQuizzesPassed) {
    nextStatus = 'completed';
  } else if (hasWorkUnits && (nextProgress > 0 || hasCompletedWork)) {
    nextStatus = 'in_progress';
  } else {
    nextStatus = 'not_started';
  }

  return { progress: nextProgress, status: nextStatus };
}

/** Crée ou enrichit chaque entrée module depuis le parcours (toutes sections / quizzes, sans écraser l’avancement). */
function bootstrapAllJourneyModulesOnRepProgressDoc(doc: any, jModules: any[]): void {
  if (!doc?.modules || !Array.isArray(jModules) || jModules.length === 0) return;

  for (let jmIdx = 0; jmIdx < jModules.length; jmIdx++) {
    const jm = jModules[jmIdx];
    const mIdRaw = normalizeAnyId(jm?._id) || normalizeAnyId(jm?.id) || String(jmIdx);
    if (!mongoose.Types.ObjectId.isValid(mIdRaw)) continue;
    const mOid = new mongoose.Types.ObjectId(mIdRaw);

    const existing = doc.modules.get(mIdRaw) as any;
    const current =
      existing ||
      ({
        moduleId: mOid,
        progress: 0,
        status: 'not_started',
        completedSections: [],
        sectionProgress: [],
        quizProgress: [],
        durationMs: 0,
        quizScores: []
      } as any);

    if (!Array.isArray(current.completedSections)) current.completedSections = [];
    if (!Array.isArray(current.quizScores)) current.quizScores = [];
    if (!Array.isArray(current.sectionProgress)) current.sectionProgress = [];
    if (!Array.isArray(current.quizProgress)) current.quizProgress = [];

    const defSec = buildDefaultSectionProgressRows(jm, jmIdx);
    const defQz = buildDefaultQuizProgressRows(jm, jmIdx);
    current.sectionProgress = mergeProgressRowsByKey(current.sectionProgress, defSec, 'sectionId');
    current.quizProgress = mergeProgressRowsByKey(current.quizProgress, defQz, 'quizKey');
    current.moduleId = mOid;

    doc.modules.set(mIdRaw, current);
  }

  doc.moduleTotal = jModules.length;
}

function syncAllModuleProgressStatusFromJourney(
  doc: any,
  jModules: any[],
  input?: { moduleId?: string; progress?: number }
): void {
  if (!doc?.modules || !Array.isArray(jModules) || jModules.length === 0) return;
  const focusMid = String(input?.moduleId || '').trim();
  for (let jmIdx = 0; jmIdx < jModules.length; jmIdx++) {
    const jm = jModules[jmIdx];
    const mIdRaw = normalizeAnyId(jm?._id) || normalizeAnyId(jm?.id) || String(jmIdx);
    if (!mongoose.Types.ObjectId.isValid(mIdRaw)) continue;
    const mOid = new mongoose.Types.ObjectId(mIdRaw);
    const current = doc.modules.get(mIdRaw) as any;
    if (!current) continue;
    const fallback =
      focusMid && mIdRaw === focusMid && typeof input?.progress === 'number' ? input.progress : undefined;
    const agg = computeModuleProgressAndStatus(current, jm, jmIdx, fallback);
    doc.modules.set(mIdRaw, {
      ...current,
      moduleId: mOid,
      progress: agg.progress,
      status: agg.status
    });
  }
}

class TrainingJourneyService {
  private resolveTrainingLogo(journey: any): { type: 'icon' | 'image'; value: string } {
    const explicitType = String(journey?.trainingLogo?.type || '').trim().toLowerCase();
    const explicitValue = String(journey?.trainingLogo?.value || '').trim();
    if ((explicitType === 'icon' || explicitType === 'image') && explicitValue) {
      return { type: explicitType as 'icon' | 'image', value: explicitValue };
    }

    const seed = `${journey?.title || ''} ${journey?.name || ''} ${journey?.description || ''}`.toLowerCase();
    if (/\b(securit|kyc|compliance|conformit|risk)\b/.test(seed)) {
      return { type: 'icon', value: 'shield' };
    }
    if (/\b(vente|sales|negociation|closing|prospection|crm)\b/.test(seed)) {
      return { type: 'icon', value: 'briefcase' };
    }
    if (/\b(report|data|analytics|kpi|tableau|dashboard)\b/.test(seed)) {
      return { type: 'icon', value: 'chart' };
    }
    if (/\b(ai|ia|tech|digital|code|developpement|devops|cloud)\b/.test(seed)) {
      return { type: 'icon', value: 'laptop' };
    }
    return { type: 'icon', value: 'book-open' };
  }

  private ensureObjectIds(journey: any): void {
    if (!journey.modules) return;

    journey.modules.forEach((module: any) => {
      if (!module._id || !mongoose.Types.ObjectId.isValid(module._id)) {
        module._id = new mongoose.Types.ObjectId().toString();
      }

      if (module.sections) {
        module.sections.forEach((section: any) => {
          if (!section._id || !mongoose.Types.ObjectId.isValid(section._id)) {
            section._id = new mongoose.Types.ObjectId().toString();
          }
        });
      }

      if (module.quizzes) {
        module.quizzes.forEach((quiz: any) => {
          if (!quiz._id || !mongoose.Types.ObjectId.isValid(quiz._id)) {
            quiz._id = new mongoose.Types.ObjectId().toString();
          }

          if (quiz.questions) {
            quiz.questions.forEach((question: any) => {
              if (!question._id || !mongoose.Types.ObjectId.isValid(question._id)) {
                question._id = new mongoose.Types.ObjectId().toString();
              }
            });
          }
        });
      }
    });

    if (journey.finalExam) {
      if (!journey.finalExam._id || !mongoose.Types.ObjectId.isValid(journey.finalExam._id)) {
        journey.finalExam._id = new mongoose.Types.ObjectId().toString();
      }

      if (journey.finalExam.questions) {
        journey.finalExam.questions.forEach((question: any) => {
          if (!question._id || !mongoose.Types.ObjectId.isValid(question._id)) {
            question._id = new mongoose.Types.ObjectId().toString();
          }
        });
      }
    }

    // New: Ensure relational IDs are valid ObjectIds if they look like ones
    // This helps Mongoose cast them correctly
    ['companyId', 'gigId', 'repId', 'industry'].forEach(field => {
      if (journey[field] && typeof journey[field] === 'string' && mongoose.Types.ObjectId.isValid(journey[field])) {
        // Mongoose will handle the actual casting, but we ensure it's a valid hex string
      }
    });
  }

  private async populateImages(journey: any): Promise<void> {
    const pres = journey.presentation;
    if (pres?.slides && Array.isArray(pres.slides)) {
      for (let i = 0; i < pres.slides.length; i++) {
        const slide = pres.slides[i];
        const desc = slide?.imageDescription;
        const hasUrl = slide?.illustrationUrl && String(slide.illustrationUrl).trim().length > 0;
        if (typeof desc === 'string' && desc.trim().length > 0 && !hasUrl) {
          try {
            slide.illustrationUrl = await ImageGenerationService.generateImage(desc);
          } catch (error) {
            console.error(`[TrainingJourneyService] Failed slide illustration ${i + 1}:`, error);
          }
        }
      }
    }

    if (!journey.modules) return;

    for (const module of journey.modules) {
      // Generate module image if description exists but URL is missing
      if (module.imageDescription && !module.imageUrl) {
        try {
          module.imageUrl = await ImageGenerationService.generateImage(module.imageDescription);
        } catch (error) {
          console.error(`[TrainingJourneyService] Failed to generate image for module: ${module.title}`, error);
        }
      }

      if (module.sections) {
        for (const section of module.sections) {
          // Generate section image if description exists but URL is missing
          if (section.imageDescription && !section.imageUrl) {
            try {
              section.imageUrl = await ImageGenerationService.generateImage(section.imageDescription);
            } catch (error) {
              console.error(`[TrainingJourneyService] Failed to generate image for section: ${section.title}`, error);
            }
          }
        }
      }
    }
  }

  async saveJourney(journeyData: Partial<ITrainingJourney>): Promise<ITrainingJourney> {
    this.ensureObjectIds(journeyData);
    const pres = (journeyData as { presentation?: { slides?: unknown[] } }).presentation;
    if (pres?.slides && Array.isArray(pres.slides)) {
      ensurePresentationSlideIdsOnSlides(pres.slides);
    }

    // Automatically populate images if descriptions are present
    await this.populateImages(journeyData);

    if (journeyData._id) {
      const existing = await TrainingJourney.findById(journeyData._id);
      if (!existing) {
        throw new AppError('Journey not found', 404);
      }

      Object.assign(existing, journeyData);
      existing.updatedAt = new Date();

      if (journeyData.presentation) {
        existing.markModified('presentation');
      }
      if (journeyData.modules) {
        existing.markModified('modules');
      }
      if (journeyData.methodologyData !== undefined) {
        existing.markModified('methodologyData');
      }

      await existing.save();
      return existing;
    }

    const journey = await TrainingJourney.create(journeyData);
    return journey;
  }

  async launchJourney(
    journeyId: string,
    enrolledRepIds: unknown
  ): Promise<ITrainingJourney> {
    const journey = await TrainingJourney.findById(journeyId);
    if (!journey) {
      throw new AppError('Journey not found', 404);
    }

    this.ensureObjectIds(journey);

    const rawList = Array.isArray(enrolledRepIds) ? enrolledRepIds : [];
    const oidList: mongoose.Types.ObjectId[] = [];
    for (const x of rawList) {
      const s = String(x ?? '').trim();
      if (mongoose.Types.ObjectId.isValid(s)) oidList.push(new mongoose.Types.ObjectId(s));
    }

    journey.status = 'active';
    journey.enrolledRepIds = oidList;
    journey.launchDate = new Date();

    await journey.save();
    return journey;
  }

  async getJourneyById(id: string): Promise<ITrainingJourney> {
    const journey = await TrainingJourney.findById(id);
    if (!journey) {
      throw new AppError('Journey not found', 404);
    }
    return journey;
  }

  async getAllJourneys(): Promise<ITrainingJourney[]> {
    return await TrainingJourney.find();
  }

  async getJourneysByStatus(status: string): Promise<ITrainingJourney[]> {
    return await TrainingJourney.find({ status });
  }

  async getJourneysByIndustry(industry: string): Promise<ITrainingJourney[]> {
    return await TrainingJourney.find({ industry });
  }

  async getJourneysForRep(repId: string): Promise<ITrainingJourney[]> {
    const id = String(repId || '').trim();
    if (!id) return [];
    const variants: (string | mongoose.Types.ObjectId)[] = [id];
    if (mongoose.Types.ObjectId.isValid(id)) {
      variants.push(new mongoose.Types.ObjectId(id));
    }
    const enrolledMatch: (string | mongoose.Types.ObjectId)[] = [...variants];
    return await TrainingJourney.find({
      $or: [
        { enrolledRepIds: { $in: enrolledMatch } },
        { repId: { $in: variants } }
      ]
    })
      .populate('gigId', '_id title status companyId')
      .sort({ updatedAt: -1 });
  }

  async getAllAvailableJourneysForTrainees(): Promise<ITrainingJourney[]> {
    return await TrainingJourney.find({
      status: { $in: ['active', 'completed'] }
    });
  }

  async deleteJourney(id: string): Promise<void> {
    const result = await TrainingJourney.findByIdAndDelete(id);
    if (!result) {
      throw new AppError('Journey not found', 404);
    }
  }

  async archiveJourney(id: string): Promise<ITrainingJourney> {
    const journey = await TrainingJourney.findByIdAndUpdate(
      id,
      { status: 'archived', updatedAt: new Date() },
      { new: true }
    );

    if (!journey) {
      throw new AppError('Journey not found', 404);
    }

    return journey;
  }

  async getJourneysByCompanyAndGig(
    companyId: string,
    gigId?: string
  ): Promise<ITrainingJourney[]> {
    const cid = String(companyId || '').trim();
    if (!cid) return [];

    const companyClauses: Record<string, unknown>[] = [{ companyId: cid }];
    if (mongoose.Types.ObjectId.isValid(cid)) {
      companyClauses.push({ companyId: new mongoose.Types.ObjectId(cid) });
    }
    // Legacy payloads sometimes stored a string id on `company` (not in current schema)
    companyClauses.push({ company: cid });

    const gid = gigId != null ? String(gigId).trim() : '';
    if (gid) {
      const gigClauses: Record<string, unknown>[] = [{ gigId: gid }];
      if (mongoose.Types.ObjectId.isValid(gid)) {
        gigClauses.push({ gigId: new mongoose.Types.ObjectId(gid) });
      }
      return await TrainingJourney.find({
        $and: [{ $or: companyClauses }, { $or: gigClauses }]
      })
        .populate('gigId', '_id title status companyId')
        .sort({ updatedAt: -1 });
    }

    return await TrainingJourney.find({ $or: companyClauses })
      .populate('gigId', '_id title status companyId')
      .sort({ updatedAt: -1 });
  }

  async getJourneysByGigId(gigId: string): Promise<ITrainingJourney[]> {
    return await TrainingJourney.find({ gigId })
      .populate('gigId', '_id title status companyId')
      .sort({ updatedAt: -1 });
  }

  /** Rep-facing: return all journeys tied to a gig (no status filter). */
  async getPublishedJourneysByGigId(gigId: string): Promise<ITrainingJourney[]> {
    const gid = String(gigId || '').trim();
    if (!gid) return [];

    const gigClauses: Record<string, unknown>[] = [{ gigId: gid }];
    if (mongoose.Types.ObjectId.isValid(gid)) {
      gigClauses.push({ gigId: new mongoose.Types.ObjectId(gid) });
    }

    const query = { $or: gigClauses };
    console.log('[TrainingJourneyService:getPublishedJourneysByGigId] query', {
      requestedGigId: gid,
      hasObjectIdVariant: mongoose.Types.ObjectId.isValid(gid),
      statuses: 'ALL'
    });

    const journeys = await TrainingJourney.find(query)
      .populate('gigId', '_id title status companyId')
      .sort({ updatedAt: -1 });

    console.log('[TrainingJourneyService:getPublishedJourneysByGigId] result', {
      requestedGigId: gid,
      count: journeys.length,
      sample: journeys.slice(0, 3).map((j: any) => ({
        id: String(j?._id || ''),
        title: j?.title || j?.name || '',
        status: j?.status || '',
        gigId: String((j as any)?.gigId?._id || (j as any)?.gigId || '')
      }))
    });
    return journeys;
  }

  async getTrainerDashboard(companyId: string, gigId?: string) {
    const journeys = await this.getJourneysByCompanyAndGig(companyId, gigId);
    const journeysWithLogo = journeys.map((journey: any) => {
      const base = typeof journey?.toObject === 'function' ? journey.toObject() : journey;
      return {
        ...base,
        trainingLogo: this.resolveTrainingLogo(journey)
      };
    });

    const enrolledRepIds = new Set<string>();
    journeys.forEach(journey => {
      if (journey.enrolledRepIds) {
        journey.enrolledRepIds.forEach((id) => enrolledRepIds.add(String(id)));
      }
    });

    if (enrolledRepIds.size === 0) {
      return {
        journeys: journeysWithLogo,
        totalTrainees: 0,
        activeTrainees: 0,
        completionRate: 0,
        averageEngagement: 0,
        topPerformers: [],
        strugglingTrainees: [],
        upcomingDeadlines: [],
        aiInsights: [{
          id: 'insight-no-trainees',
          title: 'No Trainees Enrolled',
          description: `You have ${journeys.length} journey(s) but no trainees are enrolled yet.`,
          priority: 'low',
          suggestedActions: ['Launch a journey and enroll trainees']
        }]
      };
    }

    const repProgressList = await RepProgress.find({
      journeyId: { $in: journeys.map(j => j._id) }
    });

    const repOidList = Array.from(enrolledRepIds)
      .filter((x) => mongoose.Types.ObjectId.isValid(x))
      .map((x) => new mongoose.Types.ObjectId(x));

    const reps = await Rep.find({
      _id: { $in: repOidList }
    });

    const repMap = new Map(reps.map(r => [r._id.toString(), r]));

    let activeCount = 0;
    let completedCount = 0;
    let totalEngagement = 0;

    const traineeInfoList = Array.from(enrolledRepIds).map(repId => {
      const rep = repMap.get(repId);
      if (!rep) return null;

      const progress = repProgressList.filter((p) => String(p.repId) === repId);

      let avgProgress = 0;
      let avgEngagement = 0;

      if (progress.length > 0) {
        const allProgresses: number[] = [];
        const allEngagements: number[] = [];

        progress.forEach(p => {
          if (p.modules) {
            p.modules.forEach(module => {
              allProgresses.push(module.progress);
            });
          }
          allEngagements.push(p.engagementScore);

          if (p.moduleInProgress > 0) activeCount++;
          if (p.moduleTotal > 0 && p.moduleFinished === p.moduleTotal) completedCount++;
        });

        avgProgress = allProgresses.length > 0
          ? allProgresses.reduce((a, b) => a + b, 0) / allProgresses.length
          : 0;

        avgEngagement = allEngagements.length > 0
          ? allEngagements.reduce((a, b) => a + b, 0) / allEngagements.length
          : 0;
      }

      totalEngagement += avgEngagement;

      return {
        id: repId,
        name: rep.name,
        email: rep.email,
        department: rep.department || 'Unknown',
        progress: avgProgress,
        engagement: avgEngagement,
        lastActive: 'Recently'
      };
    }).filter(Boolean);

    const validRepCount = traineeInfoList.length;

    return {
      journeys: journeysWithLogo,
      totalTrainees: validRepCount,
      activeTrainees: activeCount,
      completionRate: validRepCount > 0 ? (completedCount / validRepCount) * 100 : 0,
      averageEngagement: validRepCount > 0 ? totalEngagement / validRepCount : 0,
      topPerformers: traineeInfoList
        .sort((a: any, b: any) =>
          ((b.progress + b.engagement) / 2) - ((a.progress + a.engagement) / 2)
        )
        .slice(0, 5),
      strugglingTrainees: traineeInfoList
        .filter((t: any) => t.progress < 50 || t.engagement < 50)
        .sort((a: any, b: any) =>
          ((a.progress + a.engagement) / 2) - ((b.progress + b.engagement) / 2)
        )
        .slice(0, 5),
      upcomingDeadlines: [],
      aiInsights: []
    };
  }

  async getRepProgress(repId: string, journeyId: string) {
    const rid = String(repId || '').trim();
    const jid = String(journeyId || '').trim();
    if (!rid || !jid) return null;
    if (!mongoose.Types.ObjectId.isValid(rid) || !mongoose.Types.ObjectId.isValid(jid)) return null;
    return await RepProgress.findOne({
      repId: new mongoose.Types.ObjectId(rid),
      journeyId: new mongoose.Types.ObjectId(jid)
    });
  }

  async upsertRepProgress(input: {
    repId: string;
    journeyId: string;
    moduleId?: string;
    progress?: number;
    status?: 'not_started' | 'in_progress' | 'completed';
    completedSections?: string[];
    engagementScore?: number;
    durationMs?: number;
    sectionUpdate?: {
      /** ObjectId hex (prioritaire). */
      sectionId?: string;
      /** @deprecated utiliser `sectionId` */
      sectionKey?: string;
      sectionMongoId?: string;
      title?: string;
      status?: 'pending' | 'in_progress' | 'completed';
      durationMs?: number;
    };
    quizUpdate?: {
      quizKey: string;
      quizMongoId?: string;
      title?: string;
      status?: 'pending' | 'in_progress' | 'passed' | 'failed';
      score?: number;
      attempts?: number;
      attemptsDelta?: number;
      passed?: boolean;
      durationMs?: number;
    };
  }) {
    const rid = String(input.repId || '').trim();
    const jid = String(input.journeyId || '').trim();
    if (!rid || !jid) throw new AppError('repId and journeyId are required', 400);
    if (!mongoose.Types.ObjectId.isValid(rid) || !mongoose.Types.ObjectId.isValid(jid)) {
      throw new AppError('repId and journeyId must be valid ObjectIds', 400);
    }
    const repOid = new mongoose.Types.ObjectId(rid);
    const journeyOid = new mongoose.Types.ObjectId(jid);

    const journey = await TrainingJourney.findById(journeyOid).select('_id modules');
    const moduleTotal = Array.isArray((journey as any)?.modules) ? (journey as any).modules.length : 0;
    const jModules = Array.isArray((journey as any)?.modules) ? ((journey as any).modules as any[]) : [];

    // Auto-enroll rep when they start/continue a journey from rep-side.
    // Keep this strict (no silent catch) so failures are visible in logs/monitoring.
    const enrollResult = await TrainingJourney.updateOne(
      { _id: journeyOid },
      { $addToSet: { enrolledRepIds: repOid } }
    );
    console.log('[TrainingJourneyService:upsertRepProgress] auto-enroll result', {
      journeyId: jid,
      repId: rid,
      matchedCount: enrollResult.matchedCount,
      modifiedCount: enrollResult.modifiedCount
    });

    const doc = await RepProgress.findOneAndUpdate(
      { repId: repOid, journeyId: journeyOid },
      {
        $setOnInsert: {
          repId: repOid,
          journeyId: journeyOid,
          moduleTotal,
          moduleFinished: 0,
          moduleInProgress: 0,
          totalDurationMs: 0,
          modules: new Map()
        }
      },
      { new: true, upsert: true }
    );

    bootstrapAllJourneyModulesOnRepProgressDoc(doc, jModules);

    const hasModuleUpdate = !!input.moduleId;
    if (hasModuleUpdate) {
      const mId = String(input.moduleId || '').trim();
      if (mId && mongoose.Types.ObjectId.isValid(mId)) {
        const mOid = new mongoose.Types.ObjectId(mId);

        const applyDur = (n: unknown) =>
          typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;

        const current = (doc.modules?.get(mId) as any) || {
          moduleId: mOid,
          progress: 0,
          status: 'not_started',
          completedSections: [],
          sectionProgress: [],
          quizProgress: [],
          durationMs: 0,
          quizScores: []
        };

        if (!Array.isArray(current.completedSections)) current.completedSections = [];
        if (!Array.isArray(current.quizScores)) current.quizScores = [];
        if (!Array.isArray(current.sectionProgress)) current.sectionProgress = [];
        if (!Array.isArray(current.quizProgress)) current.quizProgress = [];

        const sectionOid = input.sectionUpdate ? normalizeSectionUpdateObjectId(input.sectionUpdate) : null;
        if (input.sectionUpdate && sectionOid) {
          const sidHex = sectionOid.toHexString();
          const st = input.sectionUpdate.status || 'completed';
          const add = applyDur(input.sectionUpdate.durationMs);
          const idx = current.sectionProgress.findIndex(
            (r: any) => progressRowMergeKey(r, 'sectionId') === sidHex
          );
          const base =
            idx >= 0
              ? { ...current.sectionProgress[idx] }
              : {
                  sectionId: sectionOid,
                  title: input.sectionUpdate.title,
                  status: 'pending',
                  durationMs: 0,
                  updatedAt: new Date()
                };
          (base as any).sectionId = sectionOid;
          if (input.sectionUpdate.title) base.title = String(input.sectionUpdate.title).trim();
          base.status = st;
          base.durationMs = Math.max(0, Math.floor(Number(base.durationMs || 0)) + add);
          base.updatedAt = new Date();
          if (idx >= 0) current.sectionProgress[idx] = base;
          else current.sectionProgress.push(base);

          if (st === 'completed') {
            const smid = sectionOid.toHexString();
            const cur = current.completedSections
              .map((x: unknown) => String(x || '').trim())
              .filter((s: string) => mongoose.Types.ObjectId.isValid(s));
            const merged = [...new Set([...cur, smid])];
            current.completedSections = merged.map((s) => new mongoose.Types.ObjectId(s));
          }
        }

        if (input.quizUpdate && String(input.quizUpdate.quizKey || '').trim()) {
          const qk = String(input.quizUpdate.quizKey).trim();
          const add = applyDur(input.quizUpdate.durationMs);
          const idx = current.quizProgress.findIndex((r: any) => String(r?.quizKey) === qk);
          const base =
            idx >= 0
              ? { ...current.quizProgress[idx] }
              : {
                  quizKey: qk,
                  title: input.quizUpdate.title,
                  status: 'pending',
                  score: 0,
                  attempts: 0,
                  passed: false,
                  durationMs: 0,
                  updatedAt: new Date()
                };
          if (input.quizUpdate.title) base.title = String(input.quizUpdate.title).trim();
          if (input.quizUpdate.status) base.status = input.quizUpdate.status;
          if (typeof input.quizUpdate.score === 'number' && Number.isFinite(input.quizUpdate.score)) {
            base.score = Math.max(0, Math.min(100, Math.round(input.quizUpdate.score)));
          }
          if (typeof input.quizUpdate.passed === 'boolean') base.passed = input.quizUpdate.passed;
          const prevAttempts = Math.max(0, Math.floor(Number(base.attempts || 0)));
          if (typeof input.quizUpdate.attempts === 'number' && Number.isFinite(input.quizUpdate.attempts)) {
            base.attempts = Math.max(0, Math.floor(input.quizUpdate.attempts));
          } else if (
            typeof input.quizUpdate.attemptsDelta === 'number' &&
            Number.isFinite(input.quizUpdate.attemptsDelta)
          ) {
            base.attempts = Math.max(0, prevAttempts + Math.floor(input.quizUpdate.attemptsDelta));
          }
          base.durationMs = Math.max(0, Math.floor(Number(base.durationMs || 0)) + add);
          base.updatedAt = new Date();

          const qmid = String(input.quizUpdate.quizMongoId || '').trim();
          if (qmid && mongoose.Types.ObjectId.isValid(qmid)) {
            (base as any).quizId = new mongoose.Types.ObjectId(qmid);
            current.quizScores = upsertQuizScoresLegacy(current.quizScores, qmid, {
              score: Number(base.score || 0),
              attempts: Number(base.attempts || 0),
              passed: !!base.passed
            });
          }

          if (idx >= 0) current.quizProgress[idx] = base;
          else current.quizProgress.push(base);
        }

        const currentCompletedSections = Array.isArray(current.completedSections)
          ? current.completedSections
              .map((s: unknown) => String(s || '').trim())
              .filter((s: string) => mongoose.Types.ObjectId.isValid(s))
          : [];
        const incomingCompletedSections = Array.isArray(input.completedSections)
          ? input.completedSections
              .map((s) => String(s || '').trim())
              .filter((s: string) => mongoose.Types.ObjectId.isValid(s))
          : [];
        const mergedCompletedSections = [...new Set([...currentCompletedSections, ...incomingCompletedSections])];
        current.completedSections = mergedCompletedSections.map((s) => new mongoose.Types.ObjectId(s));

        const granularDuration = applyDur(input.sectionUpdate?.durationMs) + applyDur(input.quizUpdate?.durationMs);
        const legacyDelta =
          !input.sectionUpdate && !input.quizUpdate ? applyDur(input.durationMs) : 0;
        const deltaDuration = granularDuration + legacyDelta;
        const nextDuration = Math.max(0, Math.floor(Number(current.durationMs || 0)) + deltaDuration);

        doc.modules.set(mId, {
          ...current,
          moduleId: mOid,
          completedSections: current.completedSections,
          sectionProgress: current.sectionProgress,
          quizProgress: current.quizProgress,
          quizScores: current.quizScores,
          durationMs: nextDuration
        });
      }
    }

    syncAllModuleProgressStatusFromJourney(doc, jModules, {
      moduleId: input.moduleId,
      progress: input.progress
    });

    if (typeof input.engagementScore === 'number' && Number.isFinite(input.engagementScore)) {
      doc.engagementScore = Math.max(0, Math.min(100, Math.round(input.engagementScore)));
    }
    const addTotal =
      (input.sectionUpdate &&
      typeof input.sectionUpdate.durationMs === 'number' &&
      Number.isFinite(input.sectionUpdate.durationMs) &&
      input.sectionUpdate.durationMs > 0
        ? Math.floor(input.sectionUpdate.durationMs)
        : 0) +
      (input.quizUpdate &&
      typeof input.quizUpdate.durationMs === 'number' &&
      Number.isFinite(input.quizUpdate.durationMs) &&
      input.quizUpdate.durationMs > 0
        ? Math.floor(input.quizUpdate.durationMs)
        : 0) +
      (!input.sectionUpdate && !input.quizUpdate &&
      typeof input.durationMs === 'number' &&
      Number.isFinite(input.durationMs) &&
      input.durationMs > 0
        ? Math.floor(input.durationMs)
        : 0);
    if (addTotal > 0) {
      doc.totalDurationMs = Math.max(0, Math.floor(Number(doc.totalDurationMs || 0)) + addTotal);
    }
    doc.lastAccessed = new Date();

    for (const mod of doc.modules.values()) {
      const m = mod as any;
      if (Array.isArray(m?.sectionProgress)) {
        m.sectionProgress = m.sectionProgress.filter(
          (r: any) => r?.sectionId != null && mongoose.Types.ObjectId.isValid(String(r.sectionId))
        );
      }
    }

    const modules = Array.from(doc.modules.values()) as any[];
    doc.moduleInProgress = modules.filter((m) => m?.status === 'in_progress').length;
    doc.moduleFinished = modules.filter((m) => m?.status === 'completed' || Number(m?.progress) >= 100).length;
    if (doc.moduleTotal > 0 && doc.moduleFinished >= doc.moduleTotal) {
      doc.completedAt = new Date();
    }

    await doc.save();
    return doc;
  }

  async getTrainingProgressByRep(repId: string) {
    const rid = String(repId || '').trim();
    if (!rid) return [];
    if (!mongoose.Types.ObjectId.isValid(rid)) return [];
    return await RepProgress.find({ repId: new mongoose.Types.ObjectId(rid) }).sort({ updatedAt: -1 });
  }

  /**
   * Moyenne des ratios de progression par formation, basée sur:
   * modules + sections + quizzes complétés.
   */
  async getRepSlideProgressSummary(repId: string, gigId?: string): Promise<RepSlideProgressSummary> {
    const empty = (): RepSlideProgressSummary => ({
      trainingCount: 0,
      journeys: [],
      sumOfRatios: 0,
      averageRatio: 0,
      overallPercent: 0,
      formulaHuman: ''
    });

    const rid = String(repId || '').trim();
    if (!rid || !mongoose.Types.ObjectId.isValid(rid)) return empty();
    const repOid = new mongoose.Types.ObjectId(rid);
    const gid = String(gigId || '').trim();

    const progresses = await RepProgress.find({ repId: repOid }).lean();
    const progressByJourney = new Map<string, (typeof progresses)[0]>();
    for (const p of progresses) {
      if (p?.journeyId) progressByJourney.set(String(p.journeyId), p);
    }

    type JourneyDocLite = {
      _id: unknown;
      title?: unknown;
      presentation?: { slides?: unknown };
      modules?: unknown;
    };
    let journeyDocs: JourneyDocLite[] = [];

    if (gid) {
      const published = await this.getPublishedJourneysByGigId(gid);
      journeyDocs = published.map((j: any) => ({
        _id: j._id,
        title: j.title,
        presentation: j.presentation,
        modules: j.modules
      }));
      if (journeyDocs.length === 0) {
        const e = empty();
        e.formulaHuman = 'Aucune formation publiée pour ce gig.';
        return e;
      }
    } else {
      const journeyIds = new Set<string>();
      for (const p of progresses) {
        if (p?.journeyId) journeyIds.add(String(p.journeyId));
      }

      if (journeyIds.size === 0) {
        const e = empty();
        e.formulaHuman = 'Aucune formation avec suivi pour ce rep.';
        return e;
      }

      const oids = [...journeyIds]
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const found = await TrainingJourney.find({ _id: { $in: oids } })
        .select('title presentation modules')
        .lean();
      journeyDocs = found as JourneyDocLite[];
    }

    const jMap = new Map<string, JourneyDocLite>();
    for (const doc of journeyDocs) {
      jMap.set(String(doc._id), doc);
    }

    const journeys: RepSlideProgressJourneyLine[] = [];

    for (const jid of [...jMap.keys()].sort()) {
      const doc = jMap.get(jid) ?? null;
      const progressRow = progressByJourney.get(jid) as any;
      const progressModules = toProgressModulesLookup(progressRow?.modules);
      const journeyModules = Array.isArray((doc as any)?.modules) ? ((doc as any).modules as any[]) : [];

      const totalModules = journeyModules.length;
      const totalSections = journeyModules.reduce(
        (acc, m) => acc + (Array.isArray(m?.sections) ? m.sections.length : 0),
        0
      );
      const totalQuizzes = journeyModules.reduce(
        (acc, m) => acc + (Array.isArray(m?.quizzes) ? m.quizzes.length : 0),
        0
      );

      let completedModules = 0;
      let completedSections = 0;
      let completedQuizzes = 0;

      journeyModules.forEach((m, mi) => {
        const moduleId = normalizeAnyId(m?._id) || normalizeAnyId(m?.id) || String(mi);
        const mp = progressModules[moduleId] || progressModules[String(mi)] || null;
        const moduleCompleted = !!mp && (mp.status === 'completed' || Number(mp.progress) >= 100);
        if (moduleCompleted) completedModules += 1;

        const sections = Array.isArray(m?.sections) ? m.sections : [];
        if (moduleCompleted) {
          completedSections += sections.length;
        } else {
          sections.forEach((s: any, si: number) => {
            if (
              isSectionCompleted(s, si, mi, mp?.completedSections || [], mp?.sectionProgress)
            ) {
              completedSections += 1;
            }
          });
        }

        const quizzes = Array.isArray(m?.quizzes) ? m.quizzes : [];
        if (moduleCompleted) {
          completedQuizzes += quizzes.length;
        } else {
          quizzes.forEach((q: any, qi: number) => {
            if (isQuizCompleted(q, qi, mi, mp?.quizScores || [], mp?.quizProgress)) {
              completedQuizzes += 1;
            }
          });
        }
      });

      const totalUnits = totalModules + totalSections + totalQuizzes;
      const completedUnits = Math.min(
        totalUnits,
        completedModules + completedSections + completedQuizzes
      );
      const ratio = totalUnits > 0 ? completedUnits / totalUnits : 0;
      const unitsCompleted = completedUnits;
      const unitsTotal = totalUnits;
      const currentSlideIndex = 0;
      journeys.push({
        journeyId: jid,
        journeyTitle: String(doc?.title || 'Formation'),
        followedDurationMs: Math.max(0, Math.floor(Number(progressRow?.totalDurationMs || 0))),
        completedUnits,
        totalUnits,
        completedModules,
        totalModules,
        completedSections,
        totalSections,
        completedQuizzes,
        totalQuizzes,
        slidesSeen: unitsCompleted,
        slidesTotal: unitsTotal,
        ratio,
        currentSlideIndex
      });
    }

    const trainingCount = journeys.length;
    const sumOfRatios = journeys.reduce((acc, j) => acc + j.ratio, 0);
    const averageRatio = trainingCount > 0 ? sumOfRatios / trainingCount : 0;
    const overallPercent = Math.min(100, Math.round(averageRatio * 100));

    const parts = journeys.map((j) => (j.totalUnits > 0 ? `${j.completedUnits}/${j.totalUnits}` : '0/0'));
    const formulaHuman =
      trainingCount === 0
        ? ''
        : `(${parts.join(' + ')}) ÷ ${trainingCount} ≈ ${overallPercent} % — moyenne modules+sections+quizzes par formation`;

    return {
      trainingCount,
      journeys,
      sumOfRatios,
      averageRatio,
      overallPercent,
      formulaHuman
    };
  }

  async getRepProgressByTraining(journeyId: string) {
    const jid = String(journeyId || '').trim();
    if (!jid) return [];
    if (!mongoose.Types.ObjectId.isValid(jid)) return [];
    return await RepProgress.find({ journeyId: new mongoose.Types.ObjectId(jid) }).sort({ updatedAt: -1 });
  }

  async recordTrainingTrackingEvent(input: {
    repId: string;
    journeyId: string;
    moduleId?: string;
    slideId?: string;
    slideIndex?: number;
    event: RepTrainingTrackingEventKind | string;
    durationMs?: number;
    /** défaut true : marque la slide comme vue / complétée dans `slides` */
    completed?: boolean;
  }) {
    const repOid = requireObjectId(input.repId, 'repId');
    const journeyOid = requireObjectId(input.journeyId, 'journeyId');

    const ev = String(input.event || '').trim() as RepTrainingTrackingEventKind;
    if (!REP_TRAINING_TRACKING_EVENTS.includes(ev)) {
      throw new AppError(`event must be one of: ${REP_TRAINING_TRACKING_EVENTS.join(', ')}`, 400);
    }

    let slideKey: string;
    const sid = input.slideId != null ? String(input.slideId).trim() : '';
    if (sid && mongoose.Types.ObjectId.isValid(sid)) {
      slideKey = new mongoose.Types.ObjectId(sid).toString();
    } else if (typeof input.slideIndex === 'number' && Number.isFinite(input.slideIndex) && input.slideIndex >= 0) {
      const journey = await TrainingJourney.findById(journeyOid).select('presentation');
      const slides = (journey?.presentation as { slides?: unknown[] } | undefined)?.slides;
      if (!Array.isArray(slides) || slides.length === 0) {
        throw new AppError('Journey has no slides', 400);
      }
      const changed = ensurePresentationSlideIdsOnSlides(slides as unknown[]);
      if (changed && journey) {
        journey.markModified('presentation');
        await journey.save();
      }
      const idx = Math.min(Math.floor(input.slideIndex), slides.length - 1);
      const slide = slides[idx] as { _id?: unknown };
      if (!slide?._id || !mongoose.Types.ObjectId.isValid(String(slide._id))) {
        throw new AppError('Could not resolve slide id', 400);
      }
      slideKey = new mongoose.Types.ObjectId(String(slide._id)).toString();
    } else {
      throw new AppError('slideId (ObjectId) or slideIndex is required', 400);
    }

    const completed = input.completed !== false;
    const $set: Record<string, unknown> = {
      repId: repOid,
      journeyId: journeyOid,
      event: ev,
      [`slides.${slideKey}`]: { completed }
    };
    if (input.moduleId != null && String(input.moduleId).trim()) {
      const rawModuleId = String(input.moduleId).trim();
      if (mongoose.Types.ObjectId.isValid(rawModuleId)) {
        $set.moduleId = new mongoose.Types.ObjectId(rawModuleId);
      }
    }
    if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs >= 0) {
      $set.durationMs = Math.floor(input.durationMs);
    }

    return await RepTrainingTracking.findOneAndUpdate(
      { repId: repOid, journeyId: journeyOid },
      { $set },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  async listTrainingTrackingEvents(opts: { repId: string; journeyId: string; limit?: number; skip?: number }) {
    const repOid = requireObjectId(opts.repId, 'repId');
    const journeyOid = requireObjectId(opts.journeyId, 'journeyId');
    const doc = await RepTrainingTracking.findOne({ repId: repOid, journeyId: journeyOid }).lean();
    return doc ? [doc] : [];
  }

  /** Tous les suivis snapshot pour un rep (une ligne par formation suivie). */
  async listTrainingTrackingByRep(repId: string) {
    const repOid = requireObjectId(repId, 'repId');
    return await RepTrainingTracking.find({ repId: repOid }).sort({ updatedAt: -1 }).lean();
  }
}

export default new TrainingJourneyService();
