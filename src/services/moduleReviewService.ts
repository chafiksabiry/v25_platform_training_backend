/**
 * Revue d'un module d'un parcours à partir de son contenu STOCKÉ (et non du dernier message du chat).
 * Logique pure (le chargement/sauvegarde du parcours est fait par le contrôleur) pour être testable.
 */
import { isModuleMarkdownConform } from './richModuleContent';

export type ReviewStatus = 'validated' | 'to_review' | 'changes_requested';
export const REVIEW_STATUSES: ReviewStatus[] = ['validated', 'to_review', 'changes_requested'];

export interface ReviewModuleSummary {
  index: number;
  title: string;
  reviewStatus: ReviewStatus;
  isValid: boolean;
}

export interface ReviewResult {
  httpStatus: number;
  body: Record<string, unknown>;
}

const plain = (v: any) => (v && typeof v.toObject === 'function' ? v.toObject() : v);

/** Contenu stocké du module `index` : markdown intégral enregistré à la génération (modules[i].description). */
export const getStoredModuleMarkdown = (journey: any, index: number): string => {
  const mod = plain((journey?.modules || [])[index]);
  const plan = plain((journey?.modulePlan || [])[index]);
  const raw = String(plan?.detailedContentMarkdown || mod?.description || '');
  return raw.replace(/<harx-style>[\s\S]*?<\/harx-style>/gi, '').trim();
};

export const summarizeReview = (journey: any): ReviewModuleSummary[] =>
  (journey?.modulePlan || []).map((raw: any, index: number) => {
    const m = plain(raw) || {};
    const isValid = m.isValid === true;
    const reviewStatus: ReviewStatus = REVIEW_STATUSES.includes(m.reviewStatus)
      ? m.reviewStatus
      : isValid
        ? 'validated'
        : 'to_review';
    return { index, title: String(m.title || ''), reviewStatus, isValid };
  });

/**
 * Applique un statut de revue au module `index`. `isValid` n'est vrai que si status === 'validated'
 * ET si le contenu stocké respecte la structure riche. Ne sauvegarde pas : l'appelant appelle journey.save().
 */
export const applyModuleReview = (
  journey: any,
  params: { index: unknown; status: unknown; note?: unknown; companyId?: string | null }
): ReviewResult => {
  const fail = (httpStatus: number, code: string, error: string, extra: Record<string, unknown> = {}): ReviewResult => ({
    httpStatus,
    body: { success: false, code, error, ...extra },
  });

  if (!journey) return fail(404, 'journey_not_found', 'Parcours introuvable.');

  const companyId = String(params.companyId || '').trim();
  if (!companyId) return fail(400, 'company_required', 'companyId est requis (corps de requête ou paramètre de requête).');
  const owner = journey.companyId ? String(journey.companyId) : '';
  if (owner && owner !== companyId) return fail(403, 'forbidden_company', "Ce parcours n'appartient pas à votre entreprise.");

  const plan = journey.modulePlan || [];
  const idx = Number(params.index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= plan.length) {
    return fail(400, 'invalid_module_index', `Index de module invalide (0 à ${Math.max(plan.length - 1, 0)}).`);
  }
  const status = String(params.status || '') as ReviewStatus;
  if (!REVIEW_STATUSES.includes(status)) {
    return fail(400, 'invalid_status', `status doit valoir ${REVIEW_STATUSES.join(' | ')}.`);
  }

  if (status === 'validated') {
    const markdown = getStoredModuleMarkdown(journey, idx);
    if (!markdown) {
      return fail(409, 'module_content_missing', "Ce module n'a pas de contenu enregistré : générez son contenu avant de le valider.");
    }
    const conformity = isModuleMarkdownConform(markdown);
    if (!conformity.conform) {
      return fail(
        409,
        'module_content_not_conform',
        "Le contenu enregistré de ce module ne respecte pas la structure attendue (objectifs, 4 à 6 sections, exemples, étude de cas, jeu de rôle, quiz de 5 QCM, synthèse, points d'attention, durée). Régénérez-le avant de le valider.",
        { missing: conformity.missing }
      );
    }
  }

  const item = plan[idx];
  item.isValid = status === 'validated';
  item.reviewStatus = status;
  item.reviewNote = typeof params.note === 'string' ? params.note.trim().slice(0, 2000) : '';
  item.reviewedAt = new Date();
  if (typeof journey.markModified === 'function') journey.markModified('modulePlan');

  return { httpStatus: 200, body: { success: true, modules: summarizeReview(journey) } };
};

/**
 * Enregistre le contenu généré d'un module dans `journey.modules` (même champ pour « module seul » et pour
 * chaque module d'un parcours complet) : description = markdown intégral, sections, quiz.
 */
export const upsertJourneyModuleContent = (
  modules: any[],
  moduleIdx: number,
  content: { markdown: string; sections: any[]; quizzes: any[]; planTitles: string[] }
): any[] => {
  const next = [...modules];
  while (next.length <= moduleIdx) {
    next.push({
      title: content.planTitles[next.length] || `Module ${next.length + 1}`,
      sections: [],
      quizzes: [],
      order: next.length + 1,
    });
  }
  const existing = plain(next[moduleIdx]) || {};
  next[moduleIdx] = {
    ...existing,
    title: String(existing.title || '').trim() || content.planTitles[moduleIdx] || `Module ${moduleIdx + 1}`,
    description: content.markdown.slice(0, 250000),
    sections: content.sections,
    quizzes:
      content.quizzes.length > 0 ? content.quizzes : Array.isArray(existing.quizzes) ? existing.quizzes : [],
    order: typeof existing.order === 'number' ? existing.order : moduleIdx + 1,
  };
  return next;
};
