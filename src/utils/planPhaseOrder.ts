/**
 * Ordre logique des modules d'un plan de formation.
 *
 * Le prompt du plan impose une ligne « Phase : <contexte|offre|prospection|conformite|suivi> » sous le titre de
 * chaque module. Cette ligne est lue ici, les modules sont triés de façon STABLE par rang de phase
 * (contexte → offre → prospection → conformité → suivi), puis renumérotés. Les modules sans phase reconnue
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
  const phases = blocks.map((b) => parseModulePhase(b));
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
