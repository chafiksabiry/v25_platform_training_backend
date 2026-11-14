/**
 * Récupération de passages de la base de connaissances (KB) d'une opération (gig).
 *
 * Avant : seuls un résumé et ~10 mots-clés par document étaient envoyés au modèle ; le texte des
 * documents n'entrait jamais dans le prompt. Ici on découpe le texte réel des documents en
 * fenêtres de 600 à 800 caractères et on retient les 3 à 6 plus pertinentes pour un module,
 * classées par mots-clés du module (titre, objectifs, thèmes clés).
 *
 * Module pur (aucun accès réseau/base) : le chargement Mongo est fait par l'appelant.
 */

export interface KbDocInput {
  name: string;
  content?: string;
  chunks?: Array<{ content?: string; index?: number }>;
}

export interface KbPassage {
  /** Identifiant stable dans le module : S1, S2… (cité dans le contenu sous la forme [S1]). */
  id: string;
  docName: string;
  text: string;
  score: number;
}

export type KbStatus = 'empty' | 'insufficient' | 'ok';

export interface KbSelection {
  passages: KbPassage[];
  status: KbStatus;
  /** Nombre de documents disposant d'un texte exploitable. */
  docsWithText: number;
}

export const PASSAGE_MIN_CHARS = 600;
export const PASSAGE_MAX_CHARS = 800;
export const PASSAGES_MIN = 3;
export const PASSAGES_MAX = 6;
const MAX_PASSAGES_PER_DOC = 3;
const MAX_DOCS = 20;
const MAX_CHARS_PER_DOC = 400_000;
const MIN_USABLE_DOC_CHARS = 50;

const STOPWORDS = new Set([
  'avec', 'dans', 'pour', 'sans', 'tout', 'tous', 'toute', 'toutes', 'sur', 'des', 'les', 'une', 'vos', 'votre',
  'vous', 'nous', 'leur', 'leurs', 'cette', 'ces', 'ses', 'son', 'est', 'sont', 'etre', 'aux', 'par', 'dont',
  'plus', 'moins', 'entre', 'comme', 'aussi', 'ainsi', 'module', 'objectifs', 'comprendre', 'maitriser',
  'from', 'that', 'this', 'then', 'have', 'will', 'into', 'about', 'which', 'with', 'your', 'their', 'what',
  'when', 'where', 'they', 'them', 'been', 'being', 'each', 'other', 'than', 'such',
]);

export const normalizeForMatch = (value: string): string =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const extractKeywords = (value: string): string[] =>
  normalizeForMatch(value)
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));

/** Mots-clés pondérés d'un module : titre ×3, thèmes clés ×2, objectifs ×1. */
export const buildModuleKeywords = (module: {
  title?: string;
  objectifs?: string[];
  keyTopics?: string[];
}): Map<string, number> => {
  const weights = new Map<string, number>();
  const add = (text: string, weight: number) => {
    for (const k of extractKeywords(text)) {
      weights.set(k, Math.max(weights.get(k) || 0, weight));
    }
  };
  add(String(module.title || ''), 3);
  for (const t of module.keyTopics || []) add(String(t || ''), 2);
  for (const o of module.objectifs || []) add(String(o || ''), 1);
  return weights;
};

const docText = (doc: KbDocInput): string => {
  const direct = String(doc.content || '');
  if (direct.trim().length >= MIN_USABLE_DOC_CHARS) return direct.slice(0, MAX_CHARS_PER_DOC);
  const fromChunks = Array.isArray(doc.chunks)
    ? doc.chunks
        .slice()
        .sort((a, b) => Number(a?.index ?? 0) - Number(b?.index ?? 0))
        .map((c) => String(c?.content || ''))
        .join('\n\n')
    : '';
  return fromChunks.slice(0, MAX_CHARS_PER_DOC);
};

/** Découpe un texte en fenêtres consécutives de 600 à 800 caractères (coupes en fin de phrase si possible). */
export const splitIntoWindows = (raw: string): string[] => {
  const text = String(raw || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return [];
  const windows: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    const remaining = text.length - pos;
    if (remaining <= PASSAGE_MAX_CHARS) {
      const tail = text.slice(pos).trim();
      // Une fin de document trop courte est rattachée à la fenêtre précédente si possible.
      if (tail.length < 200 && windows.length > 0 && windows[windows.length - 1].length + tail.length <= PASSAGE_MAX_CHARS) {
        windows[windows.length - 1] = `${windows[windows.length - 1]} ${tail}`.trim();
      } else if (tail) {
        windows.push(tail);
      }
      break;
    }
    const slice = text.slice(pos, pos + PASSAGE_MAX_CHARS);
    let cut = -1;
    const sentenceEnd = /[.!?…]\s|\n/g;
    let m: RegExpExecArray | null;
    while ((m = sentenceEnd.exec(slice)) !== null) {
      const end = m.index + m[0].length;
      if (end >= PASSAGE_MIN_CHARS) cut = end;
    }
    if (cut < 0) {
      const lastSpace = slice.lastIndexOf(' ');
      cut = lastSpace >= PASSAGE_MIN_CHARS ? lastSpace : PASSAGE_MAX_CHARS;
    }
    const piece = slice.slice(0, cut).trim();
    if (piece) windows.push(piece);
    pos += cut;
  }
  return windows;
};

const scoreWindow = (window: string, keywords: Map<string, number>): number => {
  if (keywords.size === 0) return 0;
  const norm = ` ${normalizeForMatch(window)} `;
  let score = 0;
  for (const [kw, weight] of keywords) {
    let idx = norm.indexOf(kw);
    let hits = 0;
    while (idx !== -1 && hits < 3) {
      hits += 1;
      idx = norm.indexOf(kw, idx + kw.length);
    }
    score += hits * weight;
  }
  return score;
};

/** Sélectionne 3 à 6 passages (600–800 car.) pertinents pour un module. */
export const selectKbPassages = (
  docs: KbDocInput[],
  module: { title?: string; objectifs?: string[]; keyTopics?: string[] },
  options?: { max?: number }
): KbSelection => {
  const max = Math.max(1, Math.min(options?.max ?? PASSAGES_MAX, PASSAGES_MAX));
  const keywords = buildModuleKeywords(module);

  const seen = new Set<string>();
  const usable: Array<{ name: string; text: string }> = [];
  for (const doc of (Array.isArray(docs) ? docs : []).slice(0, MAX_DOCS * 3)) {
    const name = String(doc?.name || 'Document').trim() || 'Document';
    const key = normalizeForMatch(name.split(/[\\/]/).pop() || name);
    if (seen.has(key)) continue;
    const text = docText(doc);
    if (text.trim().length < MIN_USABLE_DOC_CHARS) continue;
    seen.add(key);
    usable.push({ name, text });
    if (usable.length >= MAX_DOCS) break;
  }

  if (usable.length === 0) return { passages: [], status: 'empty', docsWithText: 0 };

  const candidates: Array<{ docName: string; docIdx: number; order: number; text: string; score: number }> = [];
  usable.forEach((doc, docIdx) => {
    splitIntoWindows(doc.text).forEach((text, order) => {
      const score = scoreWindow(text, keywords);
      if (score > 0) candidates.push({ docName: doc.name, docIdx, order, text, score });
    });
  });

  candidates.sort((a, b) => b.score - a.score || a.docIdx - b.docIdx || a.order - b.order);
  const perDoc = new Map<number, number>();
  const picked: typeof candidates = [];
  for (const c of candidates) {
    if (picked.length >= max) break;
    const used = perDoc.get(c.docIdx) || 0;
    if (used >= MAX_PASSAGES_PER_DOC) continue;
    perDoc.set(c.docIdx, used + 1);
    picked.push(c);
  }

  const passages: KbPassage[] = picked.map((c, i) => ({
    id: `S${i + 1}`,
    docName: c.docName,
    text: c.text,
    score: c.score,
  }));
  return {
    passages,
    status: passages.length >= PASSAGES_MIN ? 'ok' : 'insufficient',
    docsWithText: usable.length,
  };
};
