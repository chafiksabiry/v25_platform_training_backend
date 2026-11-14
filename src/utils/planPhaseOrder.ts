/**
 * Ordre logique des modules d'un plan de formation.
 *
 * Le prompt du plan impose une ligne « Phase : <contexte|offre|prospection|conformite|suivi> » sous le titre de
 * chaque module. Cette ligne est lue ici, les modules sont triés de façon STABLE par rang de phase
 * (contexte → offre → prospection → conformité → suivi), puis renumérotés. Sans ligne de phase, la phase est déduite du titre (mots-clés) ; les modules sans phase reconnue
 * gardent leur position ; seuls les modules avec phase se répartissent dans les positions restantes.
 * Fonction pure, sans effet de bord.
 */

export type PlanPhase = 'contexte' | 'offre' | 'prospection' | 'conformite' | 'suivi';
export const PLAN_PHASE_ORDER: PlanPhase[] = ['contexte', 'offre', 'prospection', 'conformite', 'suivi'];

const MODULE_HEADING_RE = /^(\s*#{1,6}\s*(?:[^\w\s]{1,4}\s*)?(?:\*\*)?\s*module\s*)(\d+)/i;
const PHASE_LINE_RE = /^\s*(?:[-*•]\s*)?(?:\*\*)?\s*phase\s*(?:\*\*)?\s*:\s*(?:\*\*)?\s*([A-Za-zÀ-ÿ]+)\s*(?:\*\*)?\s*\.?\s*$/i;

const normalizePhase = (raw: string): PlanPhase | null => {
  const t = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  return (PLAN_PHASE_ORDER as string[]).includes(t) ? (t as PlanPhase) : null;
};

/** Phase déclarée dans un bloc de lignes de module (première ligne « Phase : … » reconnue), sinon null. */
export const parseModulePhase = (blockLines: string[]): PlanPhase | null => {
  for (const line of blockLines) {
    const m = line.match(PHASE_LINE_RE);
    if (m) {
      const p = normalizePhase(m[1]);
      if (p) return p;
    }
  }
  return null;
};

/**
 * Repli : phase déduite des mots-clés du TITRE quand le modèle n'a pas émis de ligne « Phase : … ».
 * Le mot-clé qui apparaît le plus tôt dans le titre l'emporte. « conformité » = règles légales de la vente et
 * protection du client ; le fonctionnement du système de santé / de la sécurité sociale relève du contexte.
 */
const PHASE_KEYWORDS: Record<PlanPhase, string[]> = {
  contexte: [
    'securite sociale', 'systeme de sante', 'systeme de soin', 'assurance maladie', 'protection sociale', 'contexte',
    'marche', 'introduction', 'fondamentaux', 'fondamentale', 'generalite', 'panorama', 'enjeux', 'secteur',
  ],
  offre: ['garantie', 'produit', 'offre', 'tarif', 'formule', 'gamme'],
  prospection: ['prospection', 'appel', 'objection', 'argumentaire', 'decouverte', 'closing', 'negociation', 'vente'],
  conformite: [
    'legal', 'legaux', 'conformite', 'rgpd', 'demarchage', 'reglementation', 'reglementaire', 'deontolog',
    'protection du client', 'devoir de conseil', 'consentement',
  ],
  suivi: ['suivi', 'kpi', 'optimisation', 'indicateur', 'amelioration continue', 'bilan', 'fidelisation', 'performance'],
};

const normalizeText = (t: string): string =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const inferPhaseFromTitle = (title: string): PlanPhase | null => {
  const text = ` ${normalizeText(title)}`;
  let best: { phase: PlanPhase; pos: number } | null = null;
  for (const phase of PLAN_PHASE_ORDER) {
    for (const kw of PHASE_KEYWORDS[phase]) {
      const pos = text.indexOf(` ${kw}`);
      if (pos >= 0 && (best === null || pos < best.pos)) best = { phase, pos };
    }
  }
  return best ? best.phase : null;
};

/**
 * Titres qui relèvent TOUJOURS du contexte, même si le modèle les étiquette autrement (ex. « conformite ») :
 * le fonctionnement du système de santé / de la sécurité sociale n'est pas de la conformité de vente.
 */
const FORCED_CONTEXT_KEYWORDS = ['securite sociale', 'systeme de sante', 'assurance maladie', 'protection sociale'];

export const forcedPhaseFromTitle = (title: string): PlanPhase | null => {
  const text = ` ${normalizeText(title)} `;
  return FORCED_CONTEXT_KEYWORDS.some((kw) => text.includes(` ${kw} `) || text.includes(` ${kw}`)) ? 'contexte' : null;
};

const isPhaseLine = (line: string): boolean => {
  const m = line.match(PHASE_LINE_RE);
  return Boolean(m && normalizePhase(m[1]));
};

/**
 * Trie les modules du markdown d'un plan par rang de phase (tri stable) et renumérote « Module N ».
 * Sans au moins 2 modules ou sans aucune phase reconnue, le texte est renvoyé inchangé.
 * `stripPhaseLines` (défaut true) retire les lignes « Phase : … » du résultat.
 */
export const sortPlanMarkdownByPhase = (markdown: string, options?: { stripPhaseLines?: boolean }): string => {
  const raw = String(markdown || '');
  const strip = options?.stripPhaseLines !== false;
  const lines = raw.split('\n');
  const starts: number[] = [];
  lines.forEach((l, i) => {
    if (MODULE_HEADING_RE.test(l)) starts.push(i);
  });
  if (starts.length < 2) return raw;

  const preamble = lines.slice(0, starts[0]);
  const blocks = starts.map((from, s) => lines.slice(from, s + 1 < starts.length ? starts[s + 1] : lines.length));
  // Priorité : contexte imposé par le titre (sécurité sociale…) > phase émise par le modèle > phase déduite du
  // titre ; à défaut le module garde sa place.
  const phases = blocks.map((b) => {
    const title = b[0].replace(MODULE_HEADING_RE, '').replace(/^\s*[:\-–—]\s*/, '');
    return forcedPhaseFromTitle(title) ?? parseModulePhase(b) ?? inferPhaseFromTitle(title);
  });
  if (phases.every((p) => p === null)) return raw;

  // Positions occupées par des modules sans phase : inchangées. Les autres reçoivent les modules phasés triés.
  const phased = blocks
    .map((block, index) => ({ block, index, rank: phases[index] === null ? -1 : PLAN_PHASE_ORDER.indexOf(phases[index] as PlanPhase) }))
    .filter((x) => x.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.index - b.index);
  let cursor = 0;
  const ordered = blocks.map((block, index) => (phases[index] === null ? block : phased[cursor++].block));

  const out: string[] = [...preamble];
  ordered.forEach((block, i) => {
    const body = strip ? block.filter((l, k) => k === 0 || !isPhaseLine(l)) : block;
    body[0] = body[0].replace(MODULE_HEADING_RE, (_m, pre: string) => `${pre}${i + 1}`);
    out.push(...body);
  });
  return out.join('\n');
};
