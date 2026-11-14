import { applyModuleReview, getStoredModuleMarkdown } from '../services/moduleReviewService';
import { generateRichModule, GenerateFn } from '../services/richModuleContent';

// Module conforme produit par le pipeline riche avec un modèle simulé (aucune IA réelle).
const L = 'Explication détaillée et concrète pour le conseiller, avec raisonnement et formulation exacte. ';
const mock: GenerateFn = async (prompt) => {
  const usage = { provider: 'anthropic' as const, inputTokens: 1, outputTokens: 1, totalTokens: 2, estimated: false };
  if (prompt.startsWith('PASS A')) {
    return { text: JSON.stringify({ objectives: ['a', 'b', 'c'], sections: ['A', 'B', 'C', 'D'].map((t) => ({ title: t, notions: [], sources: [] })) }), usage };
  }
  if (prompt.startsWith('PASS B — WRITE ONE SECTION')) return { text: `#### Titre\n\n${L.repeat(10)}`, usage };
  const out: string[] = [];
  for (const part of Array.from(prompt.matchAll(/\[\[PART:(\w+)\]\]/g)).map((m) => m[1])) {
    if (part === 'examples') out.push(`[[PART:examples]]\n${L.repeat(5)}`);
    if (part === 'case') out.push(`[[PART:case]]\n${L.repeat(7)}`);
    if (part === 'roleplay')
      out.push(`[[PART:roleplay]]\n${L.repeat(3)}\n\n${Array.from({ length: 12 }, (_, i) => `**${i % 2 ? 'Agent' : 'Appelant'} :** Réplique ${i + 1} complète.`).join('\n')}`);
    if (part === 'quiz')
      out.push(`[[PART:quiz]]\n${JSON.stringify({ questions: Array.from({ length: 5 }, (_, i) => ({ question: `Q${i} ?`, options: ['a', 'b', 'c', 'd'], correctAnswer: i % 4, explanation: 'Explication suffisamment détaillée.' })) })}`);
    if (part === 'synthesis') out.push(`[[PART:synthesis]]\n- Un\n- Deux\n\n${L.repeat(3)}`);
    if (part === 'attention') out.push('[[PART:attention]]\n- Point un à respecter impérativement avec le client\n- Point deux à respecter impérativement avec le client\n- Point trois à respecter impérativement avec le client');
    if (part === 'duration') out.push('[[PART:duration]]\n45');
  }
  return { text: out.join('\n'), usage };
};
const gen = async (title: string) =>
  (await generateRichModule({ module: { title, objectifs: ['x'], keyTopics: ['y'] }, moduleNumber: 1, totalModules: 3, kbDocs: [], generate: mock })).markdown;

const makeJourney = async (overrides: Partial<Record<number, string>> = {}) => {
  const contents: Record<number, string> = {
    0: await gen('Module un'),
    1: '',
    2: await gen('Module trois'),
    ...overrides,
  };
  return {
    companyId: 'c1',
    modulePlan: [0, 1, 2].map((i) => ({ title: `Module ${i + 1}`, isValid: false })),
    modules: [0, 1, 2].map((i) => ({ title: `Module ${i + 1}`, description: contents[i] })),
    markModified: jest.fn(),
  } as any;
};

describe('revue de module sur contenu stocké', () => {
  it('valide le module 3 avec SON contenu, indépendamment du dernier message du chat (module 1)', async () => {
    const journey = await makeJourney({ 0: 'dernier message du chat : module 1 non conforme' });
    // Le module 1 stocké est non conforme : s'il était lu à la place du module 3, la validation échouerait.
    const r = applyModuleReview(journey, { index: 2, status: 'validated', companyId: 'c1' });
    expect(r.body.missing).toBeUndefined();
    expect(r.httpStatus).toBe(200);
    expect(r.body.modules).toEqual([
      { index: 0, title: 'Module 1', reviewStatus: 'to_review', isValid: false },
      { index: 1, title: 'Module 2', reviewStatus: 'to_review', isValid: false },
      { index: 2, title: 'Module 3', reviewStatus: 'validated', isValid: true },
    ]);
    expect(journey.modulePlan[0].isValid).toBe(false);
    expect(getStoredModuleMarkdown(journey, 2)).toMatch(/Module 1 : Module trois|Module trois/);
  });

  it('refuse un contenu vide avec un message clair', async () => {
    const r = applyModuleReview(await makeJourney(), { index: 1, status: 'validated', companyId: 'c1' });
    expect(r.httpStatus).toBe(409);
    expect(r.body.code).toBe('module_content_missing');
  });

  it('refuse un contenu non conforme et liste ce qui manque', async () => {
    const r = applyModuleReview(await makeJourney({ 2: '## Module 3\n### Section 1 : a\ntexte court' }), { index: 2, status: 'validated', companyId: 'c1' });
    expect(r.httpStatus).toBe(409);
    expect(r.body.code).toBe('module_content_not_conform');
    expect((r.body.missing as string[]).length).toBeGreaterThan(3);
  });

  it('to_review / changes_requested : isValid faux, note conservée, contenu non exigé', async () => {
    const journey = await makeJourney();
    const r = applyModuleReview(journey, { index: 1, status: 'changes_requested', note: ' ajouter un cas ', companyId: 'c1' });
    expect(r.httpStatus).toBe(200);
    expect(journey.modulePlan[1]).toMatchObject({ isValid: false, reviewStatus: 'changes_requested', reviewNote: 'ajouter un cas' });
    const back = applyModuleReview(journey, { index: 2, status: 'validated', companyId: 'c1' });
    const again = applyModuleReview(journey, { index: 2, status: 'to_review', companyId: 'c1' });
    expect(back.httpStatus).toBe(200);
    expect((again.body.modules as any[])[2]).toMatchObject({ reviewStatus: 'to_review', isValid: false });
  });

  it('contrôle d’accès par entreprise et validation des entrées', async () => {
    const journey = await makeJourney();
    expect(applyModuleReview(journey, { index: 2, status: 'validated', companyId: 'autre' }).httpStatus).toBe(403);
    expect(applyModuleReview(journey, { index: 2, status: 'validated' }).httpStatus).toBe(400);
    expect(applyModuleReview(journey, { index: 9, status: 'validated', companyId: 'c1' }).body.code).toBe('invalid_module_index');
    expect(applyModuleReview(journey, { index: 2, status: 'ok', companyId: 'c1' }).body.code).toBe('invalid_status');
    expect(applyModuleReview(null, { index: 0, status: 'validated', companyId: 'c1' }).httpStatus).toBe(404);
    expect(journey.modulePlan[2].isValid).toBe(false);
  });
});
