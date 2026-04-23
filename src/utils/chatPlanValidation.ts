import mongoose from 'mongoose';
import trainingJourneyService from '../services/trainingJourneyService';
import TrainingJourney from '../models/TrainingJourney';
import type { ITrainingModule } from '../models/TrainingJourney';

const cleanLine = (v: string) =>
  String(v || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\*+|\*+$/g, '')
    .replace(/^#+\s*/, '')
    .replace(/^[-•*]\s*/, '')
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

function splitMdRow(row: string) {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.replace(/\*\*/g, '').replace(/`/g, '').trim());
}

function modulesFromMarkdownTable(lines: string[]): ITrainingModule[] {
  const out: ITrainingModule[] = [];
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
    const durMin = durCell ? parseDurationMinutesFromTitle(`(${durCell})`) : 30;
    const body = [titleCell, durCell ? `Durée: ${durCell}` : '', objCell ? `Objectif: ${objCell}` : '']
      .filter(Boolean)
      .join('\n\n');
    out.push({
      title,
      description: objCell || titleCell,
      duration: durMin,
      difficulty: 'beginner',
      learningObjectives: objCell ? [objCell] : [],
      sections: [
        {
          title: 'Plan validé (aperçu)',
          content: body,
          type: 'text',
          duration: durMin,
        },
      ],
      quizzes: [],
      order: out.length,
    } as ITrainingModule);
  }
  return out;
}

function modulesFromLineBasedPlan(planMarkdown: string): ITrainingModule[] {
  const lines = planMarkdown.split('\n');
  const starts: { idx: number; title: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const normalized = cleanLine(lines[i]);
    const mh = tryParseModuleHeadingLine(normalized);
    if (mh?.tail) {
      const seq = starts.length + 1;
      const fullTitle = `Module ${seq} - ${stripModuleTitleForStorage(mh.tail)}`;
      starts.push({ idx: i, title: fullTitle });
    }
  }
  if (starts.length < 2) return [];
  const modules: ITrainingModule[] = [];
  for (let s = 0; s < starts.length; s++) {
    const from = starts[s].idx + 1;
    const to = s + 1 < starts.length ? starts[s + 1].idx : lines.length;
    const body = lines.slice(from, to).join('\n').trim();
    const title = starts[s].title;
    const lineTail = cleanLine(lines[starts[s].idx]);
    const tailOnly = tryParseModuleHeadingLine(lineTail)?.tail || title;
    const dur = parseDurationMinutesFromTitle(tailOnly);
    modules.push({
      title: stripModuleTitleForStorage(title),
      description: body.slice(0, 500) || title,
      duration: dur,
      difficulty: 'beginner',
      learningObjectives: [],
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
  return modules;
}

export function buildModulesFromPlanMarkdown(planMarkdown: string): ITrainingModule[] {
  const raw = String(planMarkdown || '').trim();
  if (!raw) return [];
  const lines = raw.split('\n');
  let modules = modulesFromLineBasedPlan(raw);
  if (modules.length < 2) {
    modules = modulesFromMarkdownTable(lines);
  }
  return modules;
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
  const planClean = String(params.planMarkdown || '').trim();
  const modules = buildModulesFromPlanMarkdown(planClean);
  if (modules.length < 2) {
    throw new Error('Plan invalide: pas assez de modules pour enregistrer.');
  }
  const title = resolveJourneyTitle(params.parsedContext);
  const md = {
    validatedPlanMarkdown: planClean.replace(/<harx-style>[\s\S]*?<\/harx-style>/gi, '').trim(),
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
      methodologyData: md,
      ...(est ? { estimatedDuration: est } : {}),
    } as any);
    journeyId = String(saved._id);
  }

  const fr = /^(oui|d['’]accord|valide|merci|super|parfait)\b/i.test(params.userMessage.trim())
    ? `**Plan enregistré** (parcours \`${journeyId}\`). Les modules du chat ne sont plus modifiables par clic ici ; poursuivez la conversation pour générer le contenu si vous le souhaitez.`
    : `**Plan enregistré** (parcours \`${journeyId}\`). Les cartes du plan ne sont plus cliquables dans ce fil ; vous pouvez continuer pour détailler un module.`;
  const en = `**Plan saved** (journey \`${journeyId}\`). Plan cards are no longer clickable here; continue the chat to generate module content if needed.`;

  return { journeyId, ackFr: fr, ackEn: en };
}
