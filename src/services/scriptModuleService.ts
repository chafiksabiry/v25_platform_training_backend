import axios from 'axios';
import mongoose from 'mongoose';

/** Marqueur interne pour identifier le module script (exigence certification / cockpit). */
export const SCRIPT_REQUIREMENT_MARKER = '__harx_script_requirement__';
const SCRIPT_MODULE_TITLE = "Script d'appel";

type ScriptPhase = { phase?: string; actor?: string; replica?: string };

type GigScript = {
  _id?: string;
  targetClient?: string;
  language?: string;
  details?: string;
  script?: ScriptPhase[];
  isActive?: boolean;
};

function knowledgeBaseApiRoot(): string | null {
  const raw =
    process.env.KNOWLEDGEBASE_API_URL ||
    process.env.VITE_BACKEND_KNOWLEDGEBASE_API ||
    process.env.VITE_DASHBOARD_KNOWLEDGEBASE_API_URL ||
    '';
  const base = String(raw).replace(/\/$/, '');
  if (!base) return null;
  return base.endsWith('/api') ? base : `${base}/api`;
}

async function fetchActiveScriptForGig(gigId: string): Promise<GigScript | null> {
  const api = knowledgeBaseApiRoot();
  if (!api) {
    console.warn('[scriptModuleService] KNOWLEDGEBASE_API_URL not configured — script module skipped');
    return null;
  }

  try {
    const res = await axios.get(`${api}/scripts/gig/${encodeURIComponent(gigId)}`, { timeout: 15000 });
    const scripts: GigScript[] = Array.isArray(res.data?.data) ? res.data.data : [];
    if (scripts.length === 0) return null;
    return scripts.find((s) => s.isActive !== false) || scripts[0];
  } catch (error) {
    console.warn('[scriptModuleService] Failed to fetch scripts for gig', gigId, error);
    return null;
  }
}

function formatScriptMarkdown(script: GigScript): string {
  const lines: string[] = [];

  if (script.details?.trim()) {
    lines.push(script.details.trim(), '');
  }

  lines.push('## Étapes du script', '');
  const phases = Array.isArray(script.script) ? script.script : [];

  phases.forEach((phase, index) => {
    const actorLabel =
      String(phase.actor || 'agent').toLowerCase() === 'lead' ? 'Prospect' : 'Agent';
    const phaseLabel = phase.phase ? `**${phase.phase}** — ` : '';
    lines.push(`${index + 1}. ${phaseLabel}*${actorLabel}* : ${String(phase.replica || '').trim()}`, '');
  });

  if (phases.length === 0) {
    lines.push('_Script sans répliques configurées._', '');
  }

  lines.push(
    '---',
    '',
    '**Exigence :** lisez l’intégralité du script avant de continuer. La certification et l’accès au cockpit nécessitent la validation de cette étape (module + quiz).'
  );

  return lines.join('\n');
}

function buildScriptRequirementModule(script: GigScript): Record<string, unknown> {
  const moduleTitle = script.targetClient
    ? `${SCRIPT_MODULE_TITLE} — ${script.targetClient}`
    : SCRIPT_MODULE_TITLE;

  return {
    _id: new mongoose.Types.ObjectId().toString(),
    title: moduleTitle,
    description:
      "Étude obligatoire du script d'appel. Requis pour la certification et l'accès au cockpit.",
    duration: 15,
    difficulty: 'beginner',
    learningObjectives: [
      "Maîtriser le déroulé du script d'appel",
      'Connaître les répliques agent et les réponses attendues du prospect',
    ],
    prerequisites: [],
    topics: ['script', 'cockpit', 'certification'],
    order: 0,
    harxRequirementType: SCRIPT_REQUIREMENT_MARKER,
    sections: [
      {
        _id: new mongoose.Types.ObjectId().toString(),
        title: 'Script complet',
        type: 'script',
        content: formatScriptMarkdown(script),
        duration: 15,
      },
    ],
    quizzes: [
      {
        _id: new mongoose.Types.ObjectId().toString(),
        title: 'Validation du script',
        description: "Confirmez votre compréhension du script d'appel.",
        passingScore: 70,
        duration: 5,
        questions: [
          {
            question:
              "Avez-vous lu et compris l'intégralité du script d'appel pour ce projet ?",
            options: [
              "Oui, j'ai étudié le script et je suis prêt(e) à l'appliquer en cockpit",
              'Non, pas encore',
            ],
            correctAnswer: 0,
            explanation:
              "La certification et l'accès au cockpit exigent la maîtrise du script d'appel.",
          },
        ],
      },
    ],
  };
}

export function isScriptRequirementModule(mod: unknown): boolean {
  if (!mod || typeof mod !== 'object') return false;
  const row = mod as Record<string, unknown>;
  if (row.harxRequirementType === SCRIPT_REQUIREMENT_MARKER) return true;
  const title = String(row.title || '').toLowerCase();
  return title.includes("script d'appel") || title.includes('script d appel');
}

/**
 * Insère (ou met à jour) le module script en tête du parcours lorsqu'un script actif existe pour le gig.
 */
export async function mergeScriptRequirementIntoJourneyModules(
  modules: unknown[] | undefined,
  gigId: unknown
): Promise<unknown[]> {
  const gid = String(gigId ?? '').trim();
  if (!gid || !mongoose.Types.ObjectId.isValid(gid)) {
    return Array.isArray(modules) ? modules : [];
  }

  const script = await fetchActiveScriptForGig(gid);
  const safeModules = Array.isArray(modules) ? [...modules] : [];
  const withoutScript = safeModules.filter((m) => !isScriptRequirementModule(m));

  if (!script) {
    return withoutScript;
  }

  const scriptModule = buildScriptRequirementModule(script);
  const reordered = withoutScript.map((m, index) => ({
    ...(typeof m === 'object' && m !== null ? m : {}),
    order: index + 1,
  }));

  return [scriptModule, ...reordered];
}

/** Ajoute ou met à jour le module script sur une formation existante liée à un gig. */
export async function syncScriptRequirementOnJourney(journey: {
  gigId?: unknown;
  modules?: unknown[];
  markModified?: (path: string) => void;
  save: () => Promise<unknown>;
}): Promise<boolean> {
  if (!journey.gigId) return false;

  const merged = await mergeScriptRequirementIntoJourneyModules(
    journey.modules as unknown[],
    journey.gigId
  );
  const before = JSON.stringify(journey.modules || []);
  const after = JSON.stringify(merged);
  if (before === after) return false;

  (journey as { modules: unknown[] }).modules = merged;
  journey.markModified?.('modules');
  await journey.save();
  return true;
}
