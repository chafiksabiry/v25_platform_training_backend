import crypto from 'crypto';
import mongoose from 'mongoose';
import TrainingJourney, { ITrainingJourney } from '../models/TrainingJourney';
import RepTrainingTracking, {
  REP_TRAINING_TRACKING_EVENTS,
  RepTrainingTrackingEventKind
} from '../models/rep_training_tracking.model';
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

function optionalObjectId(raw: unknown): mongoose.Types.ObjectId | undefined {
  const s = String(raw ?? '').trim();
  if (!s || !mongoose.Types.ObjectId.isValid(s)) return undefined;
  return new mongoose.Types.ObjectId(s);
}

/** Repère la ligne quiz du module (rep-progress envoie parfois seulement quizKey = ObjectId hex). */
function findQuizRowForUpdate(
  moduleRow: { quizzes?: unknown[] } | null | undefined,
  quizUpdate: { quizMongoId?: string; quizKey?: string }
): Record<string, unknown> | undefined {
  const quizzes = Array.isArray(moduleRow?.quizzes) ? (moduleRow!.quizzes as Record<string, unknown>[]) : [];
  const mongo = String(quizUpdate.quizMongoId || '').trim();
  if (mongo && mongoose.Types.ObjectId.isValid(mongo)) {
    const hit = quizzes.find((q: any) => String(q?.quizId) === mongo);
    if (hit) return hit as Record<string, unknown>;
  }
  const key = String(quizUpdate.quizKey || '').trim();
  if (key && mongoose.Types.ObjectId.isValid(key)) {
    const hit = quizzes.find((q: any) => String(q?.quizId) === key);
    if (hit) return hit as Record<string, unknown>;
  }
  if (key) {
    const byTitle = quizzes.find((q: any) => String(q?.title || '').trim() === key);
    if (byTitle) return byTitle as Record<string, unknown>;
  }
  return undefined;
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
  /** Nombre de formations prises en compte depuis rep_training_tracking */
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
  if (Array.isArray(raw)) {
    const out: Record<string, any> = {};
    const arr = raw as any[];
    arr.forEach((row, index) => {
      const moduleId = normalizeAnyId(row?.moduleId);
      if (!moduleId) return;
      const sections = Array.isArray(row?.sections) ? row.sections : [];
      const quizzes = Array.isArray(row?.quizzes) ? row.quizzes : [];
      const entry = {
        ...row,
        progress: Number(row?.progressPercentage || 0),
        completedSections: sections
          .filter((s: any) => String(s?.status) === 'completed')
          .map((s: any) => s?.sectionId),
        sectionProgress: sections.map((s: any) => ({
          sectionId: s?.sectionId,
          status: s?.status
        })),
        quizProgress: quizzes.map((q: any) => ({
          quizKey: normalizeAnyId(q?.quizId) || String(q?.title || ''),
          status: q?.passed ? 'passed' : q?.status,
          passed: !!q?.passed
        })),
        quizScores: quizzes.map((q: any) => ({
          quizId: q?.quizId,
          passed: !!q?.passed
        }))
      };
      out[moduleId] = entry;
      /** Repère le même module par index si le journey n’expose pas le même id que `moduleId` côté tracking. */
      out[String(index)] = entry;
    });
    return out;
  }
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
    const st = String(r.status || '');
    const ok = st === 'passed' || st === 'completed' || (r as { passed?: boolean }).passed === true;
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
    const hasCompletedWork =
      (Array.isArray(current?.completedSections) && current.completedSections.length > 0) ||
      (Array.isArray(current?.sectionProgress) &&
        current.sectionProgress.some((r: any) => String(r?.status) === 'completed')) ||
      (Array.isArray(current?.quizProgress) &&
        current.quizProgress.some(
          (r: any) =>
            String(r?.status) === 'passed' ||
            String(r?.status) === 'failed' ||
            (Number(r?.attempts) || 0) > 0
        ));
    const nextProgress = Math.max(
      0,
      Math.min(100, Math.round(Number(inputProgressFallback ?? current?.progress ?? 0)))
    );
    const nextStatus: 'not_started' | 'in_progress' | 'completed' =
      nextProgress >= 100 ? 'completed' : nextProgress > 0 || hasCompletedWork ? 'in_progress' : 'not_started';
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
    const nDone = (Array.isArray(jm.sections) ? jm.sections : []).reduce((acc: number, s: any, si: number) => {
      const done = isSectionCompleted(
        s,
        si,
        jmIdx,
        Array.isArray(current.completedSections) ? current.completedSections : [],
        current.sectionProgress
      );
      return acc + (done ? 1 : 0);
    }, 0);
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

function mustObjectId(value: string, label: string): mongoose.Types.ObjectId {
  const raw = String(value || '').trim();
  if (!mongoose.Types.ObjectId.isValid(raw)) {
    throw new AppError(`${label} must be a valid ObjectId`, 400);
  }
  return new mongoose.Types.ObjectId(raw);
}

function normalizeTrackingWithJourney(tracking: any, journeyModules: any[]): any {
  const rows = Array.isArray(tracking.modules) ? tracking.modules : [];
  const merged = journeyModules.map((jm: any, moduleIndex: number) => {
    const moduleIdRaw = normalizeAnyId(jm?._id) || normalizeAnyId(jm?.id);
    const existing =
      rows.find((m: any) => String(m?.moduleId || '') === moduleIdRaw) ||
      rows.find((m: any, idx: number) => idx === moduleIndex) ||
      null;
    const sections = Array.isArray(jm?.sections) ? jm.sections : [];
    const quizzes = Array.isArray(jm?.quizzes) ? jm.quizzes : [];
    const sectionRows = sections.map((section: any) => {
      const sectionIdRaw = normalizeAnyId(section?._id) || normalizeAnyId(section?.id);
      const prev =
        Array.isArray(existing?.sections) &&
        existing.sections.find((s: any) => String(s?.sectionId || '') === sectionIdRaw);
      return {
        sectionId: mustObjectId(sectionIdRaw, 'sectionId'),
        title: String(section?.title || '').trim() || undefined,
        status: prev?.status || 'pending',
        completedAt: prev?.completedAt
      };
    });
    const quizRows = quizzes.map((quiz: any, quizIndex: number) => {
      const quizIdRaw = normalizeAnyId(quiz?._id) || normalizeAnyId(quiz?.id);
      const quizKey = quizIdRaw || stableQuizKeyFromJourneyModule(moduleIndex, quiz, quizIndex);
      const prev =
        Array.isArray(existing?.quizzes) &&
        existing.quizzes.find((q: any) => String(q?.quizId || '') === quizKey || String(q?.quizId || '') === quizIdRaw);
      return {
        quizId: mustObjectId(quizIdRaw, 'quizId'),
        title: String(quiz?.title || '').trim() || undefined,
        status: prev?.status || 'pending',
        score: Number(prev?.score || 0),
        attempts: Number(prev?.attempts || 0),
        passed: !!prev?.passed,
        lastSubmittedAt: prev?.lastSubmittedAt
      };
    });
    return {
      moduleId: mustObjectId(moduleIdRaw, 'moduleId'),
      title: String(jm?.title || '').trim() || undefined,
      status: existing?.status || (moduleIndex === 0 ? 'in_progress' : 'locked'),
      sections: sectionRows,
      quizzes: quizRows,
      progressPercentage: Number(existing?.progressPercentage || 0),
      completedAt: existing?.completedAt
    };
  });
  tracking.modules = merged;
  tracking.totalModules = merged.length;
  return tracking;
}

function recomputeModuleAndCourseProgress(tracking: any): any {
  const modules = Array.isArray(tracking.modules) ? tracking.modules : [];
  modules.forEach((module: any, idx: number) => {
    const sections = Array.isArray(module.sections) ? module.sections : [];
    const quizzes = Array.isArray(module.quizzes) ? module.quizzes : [];
    const totalUnits = sections.length + quizzes.length;
    const completedSections = sections.filter((s: any) => s.status === 'completed').length;
    const passedQuizzes = quizzes.filter((q: any) => q.passed === true || q.status === 'completed').length;
    module.progressPercentage = totalUnits > 0 ? Math.round(((completedSections + passedQuizzes) / totalUnits) * 100) : 0;
    const allSectionsDone = sections.every((s: any) => s.status === 'completed');
    const allQuizzesPassed = quizzes.every((q: any) => q.passed === true || q.status === 'completed');
    if (totalUnits > 0 && allSectionsDone && allQuizzesPassed) {
      module.status = 'completed';
      module.completedAt = module.completedAt || new Date();
      if (modules[idx + 1] && modules[idx + 1].status === 'locked') {
        modules[idx + 1].status = 'pending';
      }
    } else if (module.status !== 'locked') {
      const started =
        sections.some((s: any) => s.status !== 'pending') ||
        quizzes.some((q: any) => Number(q.attempts || 0) > 0 || q.status !== 'pending');
      module.status = started ? 'in_progress' : 'pending';
    }
  });
  const completedModules = modules.filter((m: any) => m.status === 'completed').length;
  tracking.completedModules = completedModules;
  /** Pourcentage formation = moyenne des % modules (sections+quiz), pas seulement « modules entièrement finis ». */
  const sumModulePct = modules.reduce((acc: number, m: any) => acc + Number(m?.progressPercentage || 0), 0);
  tracking.progressPercentage =
    modules.length > 0 ? Math.min(100, Math.round(sumModulePct / modules.length)) : 0;
  tracking.status =
    completedModules >= modules.length && modules.length > 0
      ? 'completed'
      : modules.some((m: any) => m.status === 'in_progress' || m.status === 'completed')
        ? 'in_progress'
        : 'pending';
  if (tracking.status === 'completed') {
    tracking.completedAt = tracking.completedAt || new Date();
  }
  return tracking;
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

    const repProgressList = await RepTrainingTracking.find({
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

      const progress = repProgressList.filter((p: any) => String(p.repId) === repId);

      let avgProgress = 0;
      let avgEngagement = 0;

      if (progress.length > 0) {
        const allProgresses: number[] = [];
        const allEngagements: number[] = [];

        progress.forEach((p: any) => {
          if (Array.isArray((p as any).modules)) {
            (p as any).modules.forEach((module: any) => {
              allProgresses.push(Number(module.progressPercentage || 0));
            });
          }
          allEngagements.push(Number((p as any).engagementScore || 0));

          const inProgress = Array.isArray((p as any).modules)
            ? (p as any).modules.filter((m: any) => String(m?.status) === 'in_progress').length
            : 0;
          const finished = Array.isArray((p as any).modules)
            ? (p as any).modules.filter((m: any) => String(m?.status) === 'completed').length
            : 0;
          const total = Number((p as any).totalModules || ((p as any).modules?.length || 0));
          if (inProgress > 0) activeCount++;
          if (total > 0 && finished >= total) completedCount++;
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
    return await RepTrainingTracking.findOne({
      repId: new mongoose.Types.ObjectId(rid),
      $or: [{ journeyId: new mongoose.Types.ObjectId(jid) }, { courseId: new mongoose.Types.ObjectId(jid) }]
    });
  }

  async getStructuredProgress(repId: string, courseId: string, opts?: { repEnrolledId?: string }) {
    const repOid = mustObjectId(repId, 'repId');
    const courseOid = mustObjectId(courseId, 'courseId');
    const repEnrolledOid = optionalObjectId(opts?.repEnrolledId);
    const journey = await TrainingJourney.findById(courseOid).select('_id modules');
    if (!journey) throw new AppError('Journey not found', 404);
    const journeyModules = Array.isArray((journey as any).modules) ? (journey as any).modules : [];
    let tracking = await RepTrainingTracking.findOne({ repId: repOid, courseId: courseOid });
    if (!tracking) {
      tracking = await RepTrainingTracking.create({
        repId: repOid,
        ...(repEnrolledOid ? { repEnrolledId: repEnrolledOid } : {}),
        courseId: courseOid,
        journeyId: courseOid,
        status: 'pending',
        modules: [],
        progressPercentage: 0,
        completedModules: 0,
        totalModules: journeyModules.length
      });
    } else if (repEnrolledOid && !(tracking as { repEnrolledId?: mongoose.Types.ObjectId }).repEnrolledId) {
      (tracking as { repEnrolledId?: mongoose.Types.ObjectId }).repEnrolledId = repEnrolledOid;
    }
    normalizeTrackingWithJourney(tracking, journeyModules);
    if (tracking.modules.length > 0) {
      const first = tracking.modules[0];
      if (first.status === 'pending') first.status = 'in_progress';
      for (let i = 1; i < tracking.modules.length; i++) {
        if (tracking.modules[i - 1].status !== 'completed' && tracking.modules[i].status === 'pending') {
          tracking.modules[i].status = 'locked';
        }
      }
    }
    recomputeModuleAndCourseProgress(tracking);
    await tracking.save();
    return tracking;
  }

  async startSection(input: {
    repId: string;
    courseId: string;
    moduleId: string;
    sectionId: string;
    repEnrolledId?: string;
  }) {
    const tracking = await this.getStructuredProgress(input.repId, input.courseId, {
      repEnrolledId: input.repEnrolledId
    });
    const moduleId = String(input.moduleId || '').trim();
    const sectionId = String(input.sectionId || '').trim();
    const module = tracking.modules.find((m: any) => String(m.moduleId) === moduleId);
    if (!module) throw new AppError('Module not found in course', 404);
    if (module.status === 'locked') throw new AppError('Module is locked. Complete previous module first.', 409);
    const section = (module.sections || []).find((s: any) => String(s.sectionId) === sectionId);
    if (!section) throw new AppError('Section not found in module', 404);
    if (String(section.status) === 'completed') {
      return tracking;
    }
    if (module.status === 'pending') module.status = 'in_progress';
    if (section.status === 'pending') section.status = 'in_progress';
    recomputeModuleAndCourseProgress(tracking);
    await tracking.save();
    return tracking;
  }

  async completeSection(input: {
    repId: string;
    courseId: string;
    moduleId: string;
    sectionId: string;
    repEnrolledId?: string;
  }) {
    const tracking = await this.getStructuredProgress(input.repId, input.courseId, {
      repEnrolledId: input.repEnrolledId
    });
    const moduleId = String(input.moduleId || '').trim();
    const sectionId = String(input.sectionId || '').trim();
    const module = tracking.modules.find((m: any) => String(m.moduleId) === moduleId);
    if (!module) throw new AppError('Module not found in course', 404);
    if (module.status === 'locked') throw new AppError('Module is locked. Complete previous module first.', 409);
    const section = (module.sections || []).find((s: any) => String(s.sectionId) === sectionId);
    if (!section) throw new AppError('Section not found in module', 404);
    const secSt = String(section.status);
    if (secSt === 'completed') {
      return tracking;
    }
    if (secSt !== 'in_progress') {
      if (secSt === 'pending') {
        throw new AppError(
          'Section must be started before it can be completed. Call POST /training_journeys/section/start first.',
          409
        );
      }
      throw new AppError('Section must be in progress before it can be completed.', 409);
    }
    section.status = 'completed';
    section.completedAt = new Date();
    if (module.status === 'pending') module.status = 'in_progress';
    recomputeModuleAndCourseProgress(tracking);
    await tracking.save();
    return tracking;
  }

  /** Marque le quiz en `in_progress` (ouverture / reprise après échec). */
  async startQuiz(input: {
    repId: string;
    courseId: string;
    moduleId: string;
    quizId: string;
    repEnrolledId?: string;
  }) {
    const tracking = await this.getStructuredProgress(input.repId, input.courseId, {
      repEnrolledId: input.repEnrolledId
    });
    const moduleId = String(input.moduleId || '').trim();
    const quizId = String(input.quizId || '').trim();
    const module = tracking.modules.find((m: any) => String(m.moduleId) === moduleId);
    if (!module) throw new AppError('Module not found in course', 404);
    if (module.status === 'locked') throw new AppError('Module is locked. Complete previous module first.', 409);
    const quizProgress = (module.quizzes || []).find((q: any) => String(q.quizId) === quizId);
    if (!quizProgress) throw new AppError('Quiz not found in module', 404);
    const qs = String((quizProgress as any).status || '');
    if (qs === 'completed' || qs === 'in_progress') {
      return tracking;
    }
    if (qs === 'failed') {
      (quizProgress as any).status = 'in_progress';
    } else if (qs === 'pending') {
      (quizProgress as any).status = 'in_progress';
    }
    if (module.status === 'pending') module.status = 'in_progress';
    recomputeModuleAndCourseProgress(tracking);
    await tracking.save();
    return tracking;
  }

  async submitQuiz(input: {
    repId: string;
    courseId: string;
    moduleId: string;
    quizId: string;
    answers: number[];
    repEnrolledId?: string;
  }) {
    const tracking = await this.getStructuredProgress(input.repId, input.courseId, {
      repEnrolledId: input.repEnrolledId
    });
    const moduleId = String(input.moduleId || '').trim();
    const quizId = String(input.quizId || '').trim();
    const module = tracking.modules.find((m: any) => String(m.moduleId) === moduleId);
    if (!module) throw new AppError('Module not found in course', 404);
    if (module.status === 'locked') throw new AppError('Module is locked. Complete previous module first.', 409);
    const quizProgress = (module.quizzes || []).find((q: any) => String(q.quizId) === quizId);
    if (!quizProgress) throw new AppError('Quiz not found in module', 404);

    const journey = await TrainingJourney.findById(mustObjectId(input.courseId, 'courseId')).select('modules');
    const journeyModules = Array.isArray((journey as any)?.modules) ? (journey as any).modules : [];
    const jm = journeyModules.find((m: any) => String(m?._id) === moduleId || String(m?.id) === moduleId);
    const jq = Array.isArray(jm?.quizzes)
      ? jm.quizzes.find((q: any) => String(q?._id) === quizId || String(q?.id) === quizId)
      : null;
    const questions = Array.isArray(jq?.questions) ? jq.questions : [];
    const total = questions.length;
    let correct = 0;
    for (let i = 0; i < total; i++) {
      const expected = Number((questions[i] as any)?.correctAnswer);
      const given = Number((input.answers || [])[i]);
      if (Number.isFinite(expected) && given === expected) correct += 1;
    }
    const score = total > 0 ? Math.round((correct / total) * 100) : 0;
    const passed = score >= 70;

    quizProgress.score = score;
    quizProgress.attempts = Math.max(0, Number(quizProgress.attempts || 0) + 1);
    quizProgress.lastSubmittedAt = new Date();
    quizProgress.passed = passed;
    quizProgress.status = passed ? 'completed' : 'failed';

    if (module.status === 'pending') module.status = 'in_progress';
    recomputeModuleAndCourseProgress(tracking);
    await tracking.save();
    return {
      score,
      passed,
      attempts: quizProgress.attempts,
      requiredScore: 70,
      progress: tracking
    };
  }

  async upsertRepProgress(input: {
    repId: string;
    journeyId: string;
    repEnrolledId?: string;
    moduleId?: string;
    progress?: number;
    status?: 'not_started' | 'in_progress' | 'completed';
    completedSections?: string[];
    engagementScore?: number;
    durationMs?: number;
    currentModuleId?: string;
    currentSlideIndex?: number;
    currentQuizPageBySlide?: Record<string, unknown>;
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
    await TrainingJourney.updateOne({ _id: journeyOid }, { $addToSet: { enrolledRepIds: repOid } });

    const tracking = await this.getStructuredProgress(rid, jid, {
      repEnrolledId: input.repEnrolledId
    });
    const moduleId = String(input.moduleId || '').trim();
    const moduleRow = tracking.modules.find((m: any) => String(m?.moduleId) === moduleId);
    if (moduleRow && moduleRow.status === 'pending') moduleRow.status = 'in_progress';

    if (input.sectionUpdate) {
      const sectionOid = normalizeSectionUpdateObjectId(input.sectionUpdate);
      if (moduleRow && sectionOid) {
        const row = (moduleRow.sections || []).find((s: any) => String(s?.sectionId) === String(sectionOid));
        if (row) {
          const requested = (input.sectionUpdate.status || 'completed') as
            | 'pending'
            | 'in_progress'
            | 'completed';
          if (requested === 'completed') {
            const rs = String(row.status);
            if (rs === 'pending') {
              throw new AppError(
                'Section must be started before it can be completed. Call POST /training_journeys/section/start first.',
                409
              );
            }
            if (rs !== 'in_progress' && rs !== 'completed') {
              throw new AppError('Section must be in progress before it can be completed.', 409);
            }
          }
          row.status = requested;
          if (row.status === 'completed') row.completedAt = new Date();
        }
      }
    }

    if (input.quizUpdate && moduleRow) {
      const row = findQuizRowForUpdate(moduleRow, input.quizUpdate);
      if (row) {
        if (typeof input.quizUpdate.score === 'number') row.score = Math.max(0, Math.min(100, Math.round(input.quizUpdate.score)));
        if (typeof input.quizUpdate.attempts === 'number') row.attempts = Math.max(0, Math.floor(input.quizUpdate.attempts));
        if (typeof input.quizUpdate.attemptsDelta === 'number') {
          row.attempts = Math.max(0, Math.floor(Number(row.attempts || 0) + input.quizUpdate.attemptsDelta));
        }
        if (typeof input.quizUpdate.passed === 'boolean') row.passed = input.quizUpdate.passed;
        row.status =
          input.quizUpdate.status === 'passed' || row.passed
            ? 'completed'
            : input.quizUpdate.status === 'failed'
              ? 'failed'
              : 'in_progress';
        row.lastSubmittedAt = new Date();
      }
    }

    if (typeof input.currentSlideIndex === 'number' && Number.isFinite(input.currentSlideIndex)) {
      (tracking as any).slideIndex = Math.max(0, Math.floor(input.currentSlideIndex));
    }
    if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs > 0) {
      (tracking as any).durationMs = Math.max(0, Number((tracking as any).durationMs || 0) + Math.floor(input.durationMs));
    }
    recomputeModuleAndCourseProgress(tracking);
    await tracking.save();
    return tracking;
  }

  async getTrainingProgressByRep(repId: string) {
    const rid = String(repId || '').trim();
    if (!rid) return [];
    if (!mongoose.Types.ObjectId.isValid(rid)) return [];
    const rows = await RepTrainingTracking.find({ repId: new mongoose.Types.ObjectId(rid) }).sort({ updatedAt: -1 }).lean();
    return rows.map((row: any) => {
      const moduleRows = Array.isArray(row.modules) ? row.modules : [];
      const modulesObject: Record<string, any> = {};
      moduleRows.forEach((m: any) => {
        const mid = normalizeAnyId(m?.moduleId);
        if (!mid) return;
        modulesObject[mid] = {
          status: m?.status,
          progress: Number(m?.progressPercentage || 0),
          completedSections: (Array.isArray(m?.sections) ? m.sections : [])
            .filter((s: any) => String(s?.status) === 'completed')
            .map((s: any) => s?.sectionId),
          sectionProgress: (Array.isArray(m?.sections) ? m.sections : []).map((s: any) => ({
            sectionId: s?.sectionId,
            status: s?.status
          })),
          quizProgress: (Array.isArray(m?.quizzes) ? m.quizzes : []).map((q: any) => ({
            quizKey: normalizeAnyId(q?.quizId) || String(q?.title || ''),
            status: q?.passed ? 'passed' : q?.status,
            passed: !!q?.passed
          })),
          quizScores: (Array.isArray(m?.quizzes) ? m.quizzes : []).map((q: any) => ({
            quizId: q?.quizId,
            passed: !!q?.passed
          }))
        };
      });
      return {
        journeyId: normalizeAnyId(row.journeyId || row.courseId),
        moduleTotal: Number(row.totalModules || moduleRows.length || 0),
        moduleFinished: moduleRows.filter((m: any) => String(m?.status) === 'completed').length,
        moduleInProgress: moduleRows.filter((m: any) => String(m?.status) === 'in_progress').length,
        progressPercentage: Math.min(100, Math.round(Number(row.progressPercentage || 0))),
        engagementScore: Number(row.engagementScore || 0),
        lastAccessed: row.updatedAt,
        currentSlideIndex: Number(row.slideIndex || 0),
        totalDurationMs: Number(row.durationMs || 0),
        modules: modulesObject
      };
    });
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

    const progresses = await RepTrainingTracking.find({ repId: repOid }).lean();
    const progressByJourney = new Map<string, (typeof progresses)[0]>();
    for (const p of progresses as any[]) {
      const jid = normalizeAnyId((p as any)?.journeyId || (p as any)?.courseId);
      if (jid) progressByJourney.set(jid, p as any);
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
      for (const p of progresses as any[]) {
        const jid = normalizeAnyId((p as any)?.journeyId || (p as any)?.courseId);
        if (jid) journeyIds.add(jid);
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
      const currentSlideIndex = (() => {
        const raw = Number(progressRow?.currentSlideIndex);
        if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
        return Math.max(0, unitsCompleted);
      })();
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
    return await RepTrainingTracking.find({
      $or: [{ journeyId: new mongoose.Types.ObjectId(jid) }, { courseId: new mongoose.Types.ObjectId(jid) }]
    }).sort({ updatedAt: -1 });
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
      courseId: journeyOid,
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
      { repId: repOid, courseId: journeyOid },
      { $set },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  async listTrainingTrackingEvents(opts: { repId: string; journeyId: string; limit?: number; skip?: number }) {
    const repOid = requireObjectId(opts.repId, 'repId');
    const journeyOid = requireObjectId(opts.journeyId, 'journeyId');
    const doc = await RepTrainingTracking.findOne({
      repId: repOid,
      $or: [{ courseId: journeyOid }, { journeyId: journeyOid }]
    }).lean();
    return doc ? [doc] : [];
  }

  /** Tous les suivis snapshot pour un rep (une ligne par formation suivie). */
  async listTrainingTrackingByRep(repId: string) {
    const repOid = requireObjectId(repId, 'repId');
    return await RepTrainingTracking.find({ repId: repOid }).sort({ updatedAt: -1 }).lean();
  }
}

export default new TrainingJourneyService();
