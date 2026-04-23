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
  let t = title.replace(/\s*\(\s*\d+\s*(?:min|minutes?|h(?:eures?)?)\s*\)\s*$/i, '').trim();
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

function parseStructuredSections(blockLines: string[]) {
  const out = { objectifs: [] as string[], keyTopics: [] as string[], activites: [] as string[] };
  let active: 'objectifs' | 'keyTopics' | 'activites' | null = null;

  for (const raw of blockLines) {
    const line = cleanLine(raw);
    if (!line) continue;
    if (/^(objectifs? d['’]?apprentissage|objectifs?)\s*:?$/i.test(line)) {
      active = 'objectifs';
      continue;
    }
    if (/^(contenu\s+cl[eé]|contenu|key topics|topics|th[eè]mes?\s+cl[eé]s?)\s*:?$/i.test(line)) {
      active = 'keyTopics';
      continue;
    }
    if (/^(activit[eé]s?|livrables?|deliverables?)\s*:?$/i.test(line)) {
      active = 'activites';
      continue;
    }
    if (/^[-•*]\s+/.test(raw) || /^\d+[.)]\s+/.test(raw)) {
      const item = normalizeBullet(raw);
      if (!item) continue;
      if (active) out[active].push(item);
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
    const rawBlockLines = lines.slice(from, to);
    const body = rawBlockLines.join('\n').trim();
    const title = starts[s].title;
    const parsed = parseStructuredSections(rawBlockLines);
    const dur = parseDurationMinutesFromTitle(starts[s].rawTail || title);
    modulePlan.push({
      title,
      objectifs: parsed.objectifs,
      keyTopics: parsed.keyTopics,
      activites: parsed.activites,
      durationMinutes: dur,
    });
    modules.push({
      title: stripModuleTitleForStorage(title),
      description: body.slice(0, 500) || title,
      duration: dur,
      difficulty: 'beginner',
      learningObjectives: parsed.objectifs,
      topics: parsed.keyTopics,
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

function sanitizePlanForStorage(planMarkdown: string): string {
  const stripped = stripHarxTags(planMarkdown);
  const cutAtQuestion = stripped.replace(
    /\n+\*\*Souhaitez-vous[\s\S]*$/i,
    ''
  );
  return cutAtQuestion.trim();
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
}): Promise<{ journeyId: string; ackFr: string; ackEn: string }> {
  const planClean = sanitizePlanForStorage(String(params.planMarkdown || '').trim());
  const { modules, modulePlan } = buildModulesFromPlanMarkdown(planClean);
  if (modules.length < 2) {
    throw new Error('Plan invalide: pas assez de modules pour enregistrer.');
  }
  const title = resolveJourneyTitle(params.parsedContext);
  const md = {
    validatedPlanMarkdown: planClean,
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

  const fr = `**Plan enregistré** (parcours \`${journeyId}\`). Le plan est sauvegardé en champs structurés : title, objectifs, keyTopics, activités.\n\n**Prochaine étape :** demandez le contenu d'un module (ex: \`Donne le contenu du Module 1\`) ou demandez \`Génère tout le contenu de la formation selon le plan enregistré\`.`;
  const en = `**Plan saved** (journey \`${journeyId}\`). The plan is stored in structured fields: title, objectives, keyTopics, activities.\n\n**Next step:** ask for one module content (e.g. \`Give me Module 1 content\`) or ask \`Generate full training content based on the saved plan\`.`;

  return { journeyId, ackFr: fr, ackEn: en };
}
