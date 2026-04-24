import mongoose from 'mongoose';
import trainingJourneyService from '../services/trainingJourneyService';
import TrainingJourney from '../models/TrainingJourney';
import type { ITrainingModule } from '../models/TrainingJourney';

export interface ModulePlanItem {
  title: string;
  objectifs: string[];
  keyTopics: string[];
  activites: string[];
  durationMinutes?: number;
}

const cleanLine = (v: string) =>
  String(v || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\*+|\*+$/g, '')
    .replace(/^#+\s*/, '')
    .replace(/^[-•*]\s*/, '')
    .trim();

const stripHarxTags = (raw: string) =>
  String(raw || '')
    .replace(/<harx-style>[\s\S]*?<\/harx-style>/gi, '')
    .replace(/<harx-training-status>[\s\S]*?<\/harx-training-status>/gi, '')
    .trim();

export const tryParseModuleHeadingLine = (n: string): { tail: string } | null => {
  const m = n.match(/\bmodule\s*\d+\s*[—:–-]?\s*(.+)$/i);
  if (!m?.[1]) return null;
  const i = n.search(/\bmodule\s*\d+/i);
  if (i < 0 || i > 24) return null;
  const prefix = n.slice(0, i);
  if (/[a-zà-ÿæœ]/i.test(prefix)) return null;
  const tail = String(m[1])
    .trim()
    .replace(/^[:\s–-]+/u, '')
    .trim();
  return { tail };
};

export function looksLikeTrainingPlanText(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  const moduleHits = (t.match(/\bmodule\s*\d+/gi) || []).length;
  if (moduleHits >= 2) return true;
  if (/\|\s*module\s*\|/i.test(t) && /\|\s*titre\s*\|/i.test(t)) return true;
  if (/🟢\s*module\s*1/i.test(t) && /🟡\s*module\s*2/i.test(t)) return true;
  return false;
}

export function isPlanAffirmationMessage(raw: string): boolean {
  const m = String(raw || '').trim();
  if (!m || m.length > 220) return false;
  if (/^(non|no|nope|cancel|annul|refus)/i.test(m)) return false;
  const afterAffirm = m
    .replace(/^(oui|yes|ok|okay|yep|yeah|sure|d['’]accord)\b[!.,\s]*/i, '')
    .trim();
  if (afterAffirm.length > 6 && /(g[ée]n[ée]r|genere|contenu|d[ée]taille|detaille|cr[ée]e|crée|r[ée]dig|rédig|écris|ecris|ajoute)/i.test(afterAffirm)) {
    return false;
  }
  if (/^(oui|yes|ok|okay|yep|yeah|sure)\b/i.test(m)) return true;
  if (
    /\b(je\s+valide|valide\s+(le\s+)?plan|plan\s+valid|confirm(e|ation)?|j['’]accepte|c['’]est\s+(bon|ok|parfait)|parfait|enregistr(e|ez)|sauvegard|save\s+(the\s+)?plan|go\s+ahead|sounds?\s+good)\b/i.test(
      m
    )
  ) {
    return true;
  }
  return false;
}

function parseDurationMinutesFromTitle(title: string): number {
  const paren = title.match(/\(\s*(\d+)\s*(min|minutes?|h(?:eures?)?)\s*\)\s*$/i);
  if (paren?.[1] && paren[2]) {
    const n = Number(paren[1]);
    if (!Number.isFinite(n)) return 30;
    if (/^h/i.test(paren[2])) return Math.round(n * 60);
    return n;
  }
  const m = title.match(/(\d+)\s*(min|minutes?)\b/i);
  if (m?.[1]) return Math.max(5, Number(m[1]) || 30);
  return 30;
}

function stripModuleTitleForStorage(title: string): string {
  let t = String(title || '').trim();
  t = t.replace(/\s*\(\s*\d+\s*(?:min|minutes?|h(?:eures?)?)\s*\)\s*\*+/i, '').trim();
  t = t.replace(/\s*\(\s*\d+\s*(?:min|minutes?|h(?:eures?)?)\s*\)\s*$/i, '').trim();
  t = t.replace(/\s*\*+\s*$/g, '').trim();
  t = t.replace(/\s*⏱️\s*[^\n]+$/i, '').trim();
  return t;
}

function splitMdRow(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.replace(/\*\*/g, '').replace(/`/g, '').trim());
}

function normalizeBullet(line: string): string {
  return String(line || '')
    .replace(/^[-•*]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .trim();
}

/** Découpe les listes « Comprendre - a - b - c » en entrées séparées pour objectifs. */
function expandDashListItems(s: string): string[] {
  const t = String(s || '').trim();
  if (!t || t.length < 24 || !/\s+-\s+/.test(t)) return [t];
  const parts = t.split(/\s+-\s+/).map((x) => x.trim()).filter((x) => x.length > 2);
  if (parts.length < 2) return [t];
  if (/^comprendre$/i.test(parts[0])) return parts.slice(1);
  return parts;
}

/** Hors périmètre du module (CTA, suite du chat) : on arrête de classer les puces. */
function isEndOfModulePlanSection(line: string): boolean {
  return (
    /\bprochaines\s+[ée]tapes\b/i.test(line) ||
    (/^✅\s*/.test(line) && /prochaines/i.test(line)) ||
    /\bvoulez-vous\s+que\s+je\b/i.test(line) ||
    /\bquelle\s+option\s+choisissez\b/i.test(line) ||
    /\bet\s+pour\s+plus\s+tard\b/i.test(line)
  );
}

function isPlanBulletNoise(text: string): boolean {
  const x = String(text || '').trim();
  if (!x) return true;
  if (/\?\s*$/.test(x)) return true;
  if (
    /d[ée]veloppe\s+le\s+contenu\s+complet|g[ée]n[èe]re\s+l['’]?ensemble|slides,\s*exercices|modules\s+d[ée]taill[ée]s/i.test(
      x
    )
  ) {
    return true;
  }
  if (/voulez-vous|choisissez-vous|prochaines\s+[ée]tapes|pour\s+plus\s+tard/i.test(x)) return true;
  return false;
}

function cleanModulePlanFields(p: ModulePlanItem): ModulePlanItem {
  const title = stripModuleTitleForStorage(String(p.title || ''));
  const filter = (arr: string[] | undefined) =>
    (Array.isArray(arr) ? arr : []).map((s) => String(s).trim()).filter(Boolean).filter((s) => !isPlanBulletNoise(s));
  return {
    title,
    objectifs: filter(p.objectifs),
    keyTopics: filter(p.keyTopics),
    // Product choice: keep only objectifs + keyTopics for modulePlan.
    activites: [],
    durationMinutes: p.durationMinutes,
  };
}

function parseStructuredSections(blockLines: string[]) {
  const out = { objectifs: [] as string[], keyTopics: [] as string[], activites: [] as string[] };
  let active: 'objectifs' | 'keyTopics' | null = null;

  const isObjectifsHeader = (line: string) =>
    /^(🎯\s*)?(objectifs?(\s*d['’]?apprentissage)?|learning\s+objectives?)(\b|[\s:–-]|$)/i.test(line);
  const isKeyTopicsHeader = (line: string) =>
    /^(📌\s*)?(key\s*topics|topics|th[eè]mes?\s*cl[eé]s?|points?\s*cl[eé]s?|sujets?\s*cl[eé]s?|contenu\s+p[eé]dagogique|contenu\s+cl[eé]|notions?)(\b|[\s:–-]|$)/i.test(line) ||
    /^📖\s+/.test(line);
  const isActivitiesHeader = (line: string) =>
    /^(🧩\s*)?activit[eé]s?(\b|[\s:–-]|$)/i.test(line) ||
    /^(✏️|📝)\s*(exercice|atelier|pratique)/i.test(line);
  const isLivrablesHeader = (line: string) =>
    /^(📦|📋)?\s*(livrables?|deliverables?)(\b|[\s:–-]|$)/i.test(line) ||
    /^📌\s*(livrables?|deliverables?)(\b|[\s:–-]|$)/i.test(line);
  const isEvalOrQuizHeader = (line: string) =>
    /^(📊\s*)?(indicateur d['’]?[eé]valuation|evaluations?|évaluations?)(\b|[\s:–-]|$)/i.test(line) ||
    /^(🎓\s*)?auto[-\s]?[eé]valuation/i.test(line) ||
    /\bquiz\s+de\s+validation\b/i.test(line) ||
    /^✅\s*validation\s+de\s+comp[eé]tence/i.test(line);

  for (const raw of blockLines) {
    const line = cleanLine(raw);
    if (!line) continue;
    if (isEndOfModulePlanSection(line)) {
      active = null;
      break;
    }
    if (isObjectifsHeader(line)) {
      active = 'objectifs';
      continue;
    }
    if (isKeyTopicsHeader(line)) {
      active = 'keyTopics';
      continue;
    }
    if (isLivrablesHeader(line) || isEvalOrQuizHeader(line) || isActivitiesHeader(line)) {
      // Ignore activities/livrables/evaluation blocks in modulePlan extraction.
      active = null;
      continue;
    }
    if (/^📌\s*\d+(?:\.\d+)+\s+.+$/i.test(line)) {
      active = 'keyTopics';
      continue;
    }
    if (/^📌\s+.+/i.test(line) && !/key\s*topics/i.test(line) && !isLivrablesHeader(line)) {
      active = 'keyTopics';
      continue;
    }

    const isBullet = /^[-•*]\s+/.test(raw) || /^\d+[.)]\s+/.test(raw);
    if (isBullet) {
      const item = normalizeBullet(raw);
      if (!item) continue;
      if (isPlanBulletNoise(item)) continue;
      const bucket: 'objectifs' | 'keyTopics' = active ?? 'keyTopics';
      const pieces = bucket === 'objectifs' ? expandDashListItems(item) : [item];
      for (const piece of pieces) {
        if (!piece.trim()) continue;
        out[bucket].push(piece.trim());
      }
      continue;
    }
  }

  return out;
}

function modulesFromMarkdownTable(lines: string[]): { modules: ITrainingModule[]; modulePlan: ModulePlanItem[] } {
  const modules: ITrainingModule[] = [];
  const modulePlan: ModulePlanItem[] = [];
  let header: string[] | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.startsWith('|') || !line.includes('|')) continue;
    if (/^\|[\s:-]+\|/.test(line)) continue;
    const cells = splitMdRow(line);
    if (!cells.length) continue;
    const joined = cells.join(' ').toLowerCase();
    if (!header) {
      if (/\bmodule\b/.test(joined) && (/\btitre\b/.test(joined) || /\btitle\b/.test(joined))) {
        header = cells.map((c) => c.toLowerCase());
        continue;
      }
      continue;
    }
    const idxMod = header.findIndex((h) => /\bmodule\b/.test(h));
    const idxTitle = header.findIndex((h) => /\btitre\b/.test(h) || /\btitle\b/.test(h));
    const idxDur = header.findIndex((h) => /\bdur[eé]e\b/.test(h) || /\bduration\b/.test(h));
    const idxObj = header.findIndex((h) => /objectif/.test(h));
    if (idxMod < 0 || idxTitle < 0) continue;
    const modCell = cells[idxMod] || '';
    const titleCell = cells[idxTitle] || '';
    const durCell = idxDur >= 0 ? cells[idxDur] || '' : '';
    const objCell = idxObj >= 0 ? cells[idxObj] || '' : '';
    const modNum = modCell.replace(/[^0-9]/g, '');
    if (!modNum || !titleCell) continue;
    const title = `Module ${modNum} - ${titleCell}`;
    const duration = durCell ? parseDurationMinutesFromTitle(`(${durCell})`) : 30;
    const objectives = objCell ? [objCell] : [];
    const keyTopics = titleCell ? [`Parcours: ${titleCell}`] : [];

    modulePlan.push({
      title,
      objectifs: objectives,
      keyTopics,
      activites: [],
      durationMinutes: duration,
    });

    modules.push({
      title,
      description: objCell || titleCell,
      duration,
      difficulty: 'beginner',
      learningObjectives: objectives,
      topics: keyTopics,
      sections: [
        {
          title: 'Plan validé (aperçu)',
          content: [titleCell, durCell ? `Durée: ${durCell}` : '', objCell ? `Objectif: ${objCell}` : '']
            .filter(Boolean)
            .join('\n\n'),
          type: 'text',
          duration,
        },
      ],
      quizzes: [],
      order: modules.length,
    } as ITrainingModule);
  }
  return { modules, modulePlan };
}

/** Coupe le bloc d'un module avant footer CTA / séparateur (ex. --- puis « Quelle option »). */
function trimModuleBlockFooter(rawBlockLines: string[]): string[] {
  const out: string[] = [];
  for (const raw of rawBlockLines) {
    const t = String(raw || '').trim();
    if (/^---+$/u.test(t)) break;
    if (/^#{1,3}\s*✅\s*Prochaines/i.test(t)) break;
    if (/^#{1,3}\s*[^\n]*\bProchaines\s+[ée]tapes\b/i.test(t)) break;
    if (/^\*\*Voulez-vous que je\b/i.test(t)) break;
    const cl = cleanLine(raw);
    if (
      /quelle\s+option|préférez-vous|preferez-vous|souhaitez-vous|une\s+autre\s+piste|cliquez\s+sur|valider\s+le\s+plan|choisissez-vous|voulez-vous\s+que\s+je/i.test(
        cl
      )
    ) {
      break;
    }
    if (/^#{1,3}\s*(option\s+[AB]\b|\*\*option)/i.test(cl)) break;
    if (isEndOfModulePlanSection(cl)) break;
    out.push(raw);
  }
  return out;
}

function modulesFromLineBasedPlan(planMarkdown: string): { modules: ITrainingModule[]; modulePlan: ModulePlanItem[] } {
  const lines = planMarkdown.split('\n');
  const starts: { idx: number; title: string; rawTail: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const normalized = cleanLine(lines[i]);
    const mh = tryParseModuleHeadingLine(normalized);
    if (mh?.tail) {
      const seq = starts.length + 1;
      const fullTitle = `Module ${seq} - ${stripModuleTitleForStorage(mh.tail)}`;
      starts.push({ idx: i, title: fullTitle, rawTail: mh.tail });
    }
  }
  if (starts.length < 2) return { modules: [], modulePlan: [] };
  const modules: ITrainingModule[] = [];
  const modulePlan: ModulePlanItem[] = [];
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s].idx + 1;
    const to = s + 1 < starts.length ? starts[s + 1].idx : lines.length;
    const rawBlockLines = trimModuleBlockFooter(lines.slice(from, to));
    const body = rawBlockLines.join('\n').trim();
    const title = starts[s].title;
    const parsed = parseStructuredSections(rawBlockLines);
    const dur = parseDurationMinutesFromTitle(starts[s].rawTail || title);
    const cleaned = cleanModulePlanFields({
      title,
      objectifs: parsed.objectifs,
      keyTopics: parsed.keyTopics,
      activites: parsed.activites,
      durationMinutes: dur,
    });
    modulePlan.push(cleaned);
    modules.push({
      title: stripModuleTitleForStorage(cleaned.title),
      description: body.slice(0, 80000) || cleaned.title,
      duration: dur,
      difficulty: 'beginner',
      learningObjectives: cleaned.objectifs,
      topics: cleaned.keyTopics,
      sections: [
        {
          title: 'Plan validé',
          content: body || title,
          type: 'text',
          duration: dur,
        },
      ],
      quizzes: [],
      order: s,
    } as ITrainingModule);
  }
  return { modules, modulePlan };
}

export function buildModulesFromPlanMarkdown(
  planMarkdown: string
): { modules: ITrainingModule[]; modulePlan: ModulePlanItem[] } {
  const raw = String(planMarkdown || '').trim();
  if (!raw) return { modules: [], modulePlan: [] };
  const lineBased = modulesFromLineBasedPlan(raw);
  if (lineBased.modules.length >= 2) return lineBased;
  return modulesFromMarkdownTable(raw.split('\n'));
}

function toSentenceChunks(text: string): string[] {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/[.!?]\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 6)
    .slice(0, 6);
}

function titleTailForFallback(planTitle: string): string {
  return String(planTitle || '')
    .replace(/^\s*module\s*\d+\s*[-:–]\s*/i, '')
    .trim();
}

function chunkLooksLikePlanNoise(s: string): boolean {
  const t = String(s || '').trim();
  if (!t || t.length > 480) return true;
  if (/\?\s*$/.test(t)) return true;
  if (/\*\*|__|\[[^\]]+\]\([^)]+\)/.test(t)) return true;
  if (/quelle\s+option|souhaitez-vous|préférez-vous|preferez-vous|autre\s+piste|^\s*---/i.test(t)) return true;
  if (/^comprendre\s+---/i.test(t)) return true;
  return false;
}

function enrichStructuredPlan(
  modules: ITrainingModule[],
  modulePlan: ModulePlanItem[]
): { modules: ITrainingModule[]; modulePlan: ModulePlanItem[] } {
  const nextModules = [...modules];
  const nextPlan = modulePlan.map((p, idx) => {
    const mod = nextModules[idx] as any;
    const desc = String(mod?.description || mod?.sections?.[0]?.content || '').trim();
    const chunks = toSentenceChunks(desc);
    const genericTopic = /^concepts?\s+cl[eé]s\s+du\s+module$/i;
    const genericAct = /^r[ée]sum[ée]\s+op[eé]rationnel|^checklist/i;
    const hasRealObjectifs = Array.isArray(p.objectifs) && p.objectifs.some((x) => String(x || '').trim().length > 12);
    const hasRealTopics =
      Array.isArray(p.keyTopics) &&
      p.keyTopics.some((x) => String(x || '').trim().length > 8 && !genericTopic.test(String(x).trim()));
    const hasRealActivities = false;

    const tail = titleTailForFallback(p.title);
    const chunk0 = chunks[0] || '';
    const useChunk = chunk0 && !chunkLooksLikePlanNoise(chunk0);
    const fallbackObj = useChunk
      ? [`Comprendre ${chunk0.toLowerCase()}`]
      : tail.length >= 10
        ? [
            `Identifier les enjeux et objectifs liés à : ${tail}`,
            `Mettre en œuvre les notions utiles pour : ${tail.slice(0, 160)}`,
          ]
        : ['Comprendre les fondamentaux du module'];
    const fallbackTopics =
      useChunk && chunks.length > 1
        ? chunks.slice(0, 2)
        : tail.length >= 10
          ? [tail.slice(0, 200), 'Liens avec le contexte métier et les ressources disponibles']
          : ['Concepts clés du module'];
    const fallbackLivrables: string[] = [];

    const objectifs = hasRealObjectifs ? p.objectifs : fallbackObj;
    const keyTopics = hasRealTopics ? p.keyTopics : fallbackTopics;
    const activites = hasRealActivities ? p.activites : fallbackLivrables;

    if (mod) {
      mod.learningObjectives = objectifs;
      mod.topics = keyTopics;
      if (!Array.isArray(mod.sections) || mod.sections.length === 0) {
        mod.sections = [{
          title: 'Plan validé',
          content: desc || `${p.title}\n\nObjectifs:\n- ${objectifs.join('\n- ')}`,
          type: 'text',
          duration: Number(mod.duration || 30),
        }];
      }
    }

    return cleanModulePlanFields({
      ...p,
      objectifs,
      keyTopics,
      activites,
    });
  });

  return { modules: nextModules, modulePlan: nextPlan };
}

function buildStrictPlanMarkdown(modulePlan: ModulePlanItem[]): string {
  const out: string[] = [];
  modulePlan.forEach((m, idx) => {
    const title = String(m.title || '').replace(/^Module\s*\d+\s*-\s*/i, '').trim() || `Module ${idx + 1}`;
    out.push(`Module ${idx + 1}: ${title}`);
    out.push('🎯 Objectifs');
    (Array.isArray(m.objectifs) && m.objectifs.length > 0 ? m.objectifs : ['Objectif à définir']).forEach((x) => out.push(`- ${String(x).trim()}`));
    out.push('📌 Key Topics');
    (Array.isArray(m.keyTopics) && m.keyTopics.length > 0 ? m.keyTopics : ['Topic à définir']).forEach((x) => out.push(`- ${String(x).trim()}`));
    out.push('🧩 Activités');
    (Array.isArray(m.activites) && m.activites.length > 0 ? m.activites : ['Activité à définir']).forEach((x) => out.push(`- ${String(x).trim()}`));
    out.push('📊 Indicateur d’évaluation');
    out.push('- Validation du module via quiz/simulation');
    out.push('');
  });
  return out.join('\n').trim();
}

export function sanitizePlanForStorage(planMarkdown: string): string {
  let stripped = stripHarxTags(planMarkdown);
  stripped = stripped.replace(/\n+\*\*Souhaitez-vous[\s\S]*$/i, '').trim();
  stripped = stripped.replace(/\n---\s*\n+\s*\*?\*?Quelle option[\s\S]*$/i, '').trim();
  stripped = stripped.replace(/\n\*?\*?Quelle option préférez-vous[\s\S]*$/i, '').trim();
  stripped = stripped.replace(/\n+\*\*Ou souhaitez-vous[\s\S]*$/i, '').trim();
  stripped = stripped.replace(/\n+\*\*Quelle option[\s\S]*$/i, '').trim();
  stripped = stripped.replace(/\n+Dites-moi\b[\s\S]*$/i, '').trim();
  stripped = stripped.replace(/\n---\s*\n+\s*##\s*✅\s*Prochaines[\s\S]*$/i, '').trim();
  stripped = stripped.replace(/\n##\s*✅\s*Prochaines\s+[ée]tapes[\s\S]*$/i, '').trim();
  stripped = stripped.replace(/\n\*\*Voulez-vous que je[\s\S]*$/i, '').trim();
  stripped = stripped.replace(/\nQuelle option choisissez[\s\S]*$/i, '').trim();
  return stripped;
}

/**
 * Parse assistant markdown into the same `modulePlan` shape stored on TrainingJourney
 * (title, objectifs, keyTopics, activites, durationMinutes).
 */
export function extractModulePlanFromAssistantMarkdown(rawAssistantText: string): ModulePlanItem[] {
  const planClean = sanitizePlanForStorage(String(rawAssistantText || ''));
  const parsed = buildModulesFromPlanMarkdown(planClean);
  const enriched = enrichStructuredPlan(parsed.modules, parsed.modulePlan);
  return Array.isArray(enriched.modulePlan) ? enriched.modulePlan : [];
}

function resolveJourneyTitle(parsedContext: any): string {
  const t =
    String(parsedContext?.personalizationProfile?.objective || '').trim() ||
    String(parsedContext?.trainingTitle || '').trim() ||
    String(parsedContext?.selectedGigTitle || '').trim() ||
    'Formation (plan chat)';
  return t.slice(0, 180);
}

export async function persistValidatedChatPlan(params: {
  planMarkdown: string;
  trainingJourneyId?: mongoose.Types.ObjectId | null;
  gigId?: mongoose.Types.ObjectId | null;
  companyId?: mongoose.Types.ObjectId | null;
  parsedContext: any;
  userMessage: string;
}): Promise<{ journeyId: string; ackFr: string; ackEn: string; modulePlan: ModulePlanItem[] }> {
  const planClean = sanitizePlanForStorage(String(params.planMarkdown || '').trim());
  const parsed = buildModulesFromPlanMarkdown(planClean);
  const enriched = enrichStructuredPlan(parsed.modules, parsed.modulePlan);
  const modules = enriched.modules;
  const modulePlan = enriched.modulePlan;
  if (modules.length < 2) {
    throw new Error('Plan invalide: pas assez de modules pour enregistrer.');
  }
  const strictPlanMarkdown = buildStrictPlanMarkdown(modulePlan);
  const title = resolveJourneyTitle(params.parsedContext);
  const md = {
    // Conserver le markdown issu du chat (titres 🎯/📌, puces réelles) ; le gabarit strict sert surtout de secours.
    validatedPlanMarkdown: planClean.length >= 120 ? planClean : strictPlanMarkdown,
    planValidatedAt: new Date().toISOString(),
    planFrozenFromChat: true,
  };
  const est = String(params.parsedContext?.selectedDuration || '').trim() || undefined;

  let journeyId: string;
  if (params.trainingJourneyId && mongoose.Types.ObjectId.isValid(String(params.trainingJourneyId))) {
    const existing = await TrainingJourney.findById(params.trainingJourneyId);
    if (!existing) {
      throw new Error('Parcours introuvable.');
    }
    const mergedMd = { ...(existing.methodologyData as object), ...md };
    const saved = await trainingJourneyService.saveJourney({
      _id: existing._id,
      modules,
      modulePlan,
      methodologyData: mergedMd,
      ...(est ? { estimatedDuration: est } : {}),
    } as any);
    journeyId = String(saved._id);
  } else {
    const saved = await trainingJourneyService.saveJourney({
      name: title,
      title,
      description: 'Plan validé depuis le chat.',
      gigId: params.gigId || undefined,
      companyId: params.companyId || undefined,
      status: 'draft',
      modules,
      modulePlan,
      methodologyData: md,
      ...(est ? { estimatedDuration: est } : {}),
    } as any);
    journeyId = String(saved._id);
  }

  const fr = `**Plan enregistré** (parcours \`${journeyId}\`). Le plan est sauvegardé en champs structurés : title, objectifs, keyTopics.\n\n**Prochaine étape :** demandez le contenu d'un module (ex: \`Donne le contenu du Module 1\`) ou demandez \`Génère tout le contenu de la formation selon le plan enregistré\`.`;
  const en = `**Plan saved** (journey \`${journeyId}\`). The plan is stored in structured fields: title, objectives, keyTopics.\n\n**Next step:** ask for one module content (e.g. \`Give me Module 1 content\`) or ask \`Generate full training content based on the saved plan\`.`;

  return { journeyId, ackFr: fr, ackEn: en, modulePlan };
}
