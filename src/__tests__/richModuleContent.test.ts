import fs from 'fs';
import path from 'path';
import { selectKbPassages, splitIntoWindows, KbDocInput } from '../services/knowledgePassages';
import {
  generateRichModule,
  buildSingleCallStructureInstructions,
  estimateModuleTokens,
  isModuleMarkdownConform,
  validateModuleMarkdown,
  GenerateFn,
  PlanModuleInput,
} from '../services/richModuleContent';

/* ── Jeu de 3 documents d'exemple (opération fictive d'assurance santé) ── */
const para = (s: string, n: number) => Array.from({ length: n }, (_, i) => `${s} (point ${i + 1}).`).join(' ');
const DOCS: KbDocInput[] = [
  {
    name: 'offres-sante.pdf',
    content:
      'Offre Santé Essentielle : cotisation de 29 € par mois, remboursement des consultations à 100 % du tarif de base. ' +
      para('La garantie hospitalisation de l’offre Santé Essentielle couvre le forfait journalier et la chambre particulière', 8) +
      ' Offre Santé Confort : cotisation de 49 € par mois avec optique renforcée. ' +
      para('La garantie optique de l’offre Santé Confort couvre deux équipements tous les deux ans', 8),
  },
  {
    name: 'procedure-reclamation.docx',
    content:
      para('Procédure de réclamation client : accuser réception sous 48 heures, qualifier la réclamation, proposer une solution et tracer la réclamation dans le CRM', 14),
  },
  {
    name: 'conformite.txt',
    content:
      para('Règles de conformité appelant : vérifier l’identité de l’appelant, recueillir le consentement avant tout enregistrement, ne jamais promettre un remboursement non garanti', 14),
  },
];
const MODULE: PlanModuleInput = {
  title: 'Présenter les offres Santé et traiter une réclamation',
  objectifs: ['Présenter les garanties hospitalisation et optique', 'Traiter une réclamation client'],
  keyTopics: ['offre Santé Essentielle', 'offre Santé Confort', 'procédure de réclamation', 'conformité appelant'],
  durationMinutes: 60,
};

/* ── Modèle simulé (aucune IA réelle) ── */
interface Sabotage {
  shortQuizOnFirstCall?: boolean;
  noRoleplayOnFirstCall?: boolean;
  inventedPriceInSection2OnFirstCall?: boolean;
}
const LOREM = (n: number) => 'Explication détaillée et concrète pour le conseiller, avec raisonnement et formulation exacte à employer. '.repeat(n);

const makeModel = (sab: Sabotage = {}) => {
  const prompts: string[] = [];
  const systems: string[] = [];
  const state = { quiz: 0, roleplay: 0, section2: 0 };
  const generate: GenerateFn = async (prompt, system) => {
    prompts.push(prompt);
    systems.push(system);
    const usage = { provider: 'anthropic' as const, model: 'mock', inputTokens: 1000, outputTokens: 500, totalTokens: 1500, estimated: false };
    const ids = Array.from(prompt.matchAll(/<passage id="(S\d+)"/g)).map((m) => m[1]);
    const cite = ids.length ? ` [${ids[0]}]` : '';
    if (prompt.startsWith('PASS A')) {
      const secs = ['Les offres', 'Les garanties', 'La réclamation', 'La conformité', 'La posture'].map((t, i) => ({
        title: t,
        goal: `Maîtriser ${t}`,
        notions: [{ text: `notion ${i + 1}`, sources: ids.slice(0, 1), general: false }],
        sources: ids.slice(i % Math.max(ids.length, 1), (i % Math.max(ids.length, 1)) + 1),
      }));
      return { text: JSON.stringify({ objectives: ['Objectif 1', 'Objectif 2', 'Objectif 3'], durationMinutes: 60, sections: secs, caseStudyTheme: 'Client mécontent', pitfalls: ['Promettre trop'] }), usage };
    }
    if (prompt.startsWith('PASS B — WRITE ONE SECTION')) {
      const m = prompt.match(/SECTION TO WRITE \((\d+)\//);
      const idx = Number(m?.[1]);
      const allowed = Array.from(prompt.split('KNOWLEDGE-BASE PASSAGES FOR THIS SECTION:')[1]?.matchAll(/<passage id="(S\d+)"/g) || []).map((x) => x[1]);
      const c = allowed.length ? ` [${allowed[0]}]` : '';
      let body = `Introduction.${c}\n\n#### Développement\n\n${LOREM(10)}${c}\n\n> 💡 **À retenir** : point clé.${c}`;
      if (idx === 2) {
        state.section2 += 1;
        if (sab.inventedPriceInSection2OnFirstCall && state.section2 === 1) body += ' L’offre Platinum coûte 99 € par mois.';
      }
      return { text: body, usage };
    }
    const wanted = Array.from(prompt.matchAll(/\[\[PART:(\w+)\]\]/g)).map((m) => m[1]);
    const out: string[] = [];
    for (const part of wanted) {
      if (part === 'examples') out.push(`[[PART:examples]]\n1. ${LOREM(3)}${cite}\n2. ${LOREM(3)}${cite}`);
      if (part === 'case') out.push(`[[PART:case]]\n${LOREM(7)}${cite}`);
      if (part === 'roleplay') {
        state.roleplay += 1;
        if (sab.noRoleplayOnFirstCall && state.roleplay === 1) continue;
        const turns = Array.from({ length: 12 }, (_, i) => `**${i % 2 ? 'Agent' : 'Appelant'} :** Réplique numéro ${i + 1} pleine et naturelle de la conversation.${i === 1 ? cite : ''}`);
        out.push(`[[PART:roleplay]]\nScénario : un appelant réclame. ${LOREM(3)}\n\n${turns.join('\n')}\n\n- Bonne pratique observée`);
      }
      if (part === 'quiz') {
        state.quiz += 1;
        const n = sab.shortQuizOnFirstCall && state.quiz === 1 ? 3 : 5;
        const questions = Array.from({ length: n }, (_, i) => ({
          question: `Question ${i + 1} ?`,
          options: ['Option A', 'Option B', 'Option C', 'Option D'],
          correctAnswer: i % 4,
          explanation: 'La bonne réponse est justifiée par la procédure de l’opération.',
        }));
        out.push(`[[PART:quiz]]\n${JSON.stringify({ questions })}`);
      }
      if (part === 'synthesis') out.push(`[[PART:synthesis]]\n- Point clé 1${cite}\n- Point clé 2\n\nEn une phrase : maîtriser l’offre et la réclamation. ${LOREM(2)}`);
      if (part === 'attention') out.push(`[[PART:attention]]\n- Ne jamais promettre un remboursement non garanti${cite}\n- Vérifier l’identité\n- Tracer la réclamation\n- Respecter le consentement`);
      if (part === 'duration') out.push('[[PART:duration]]\n60');
    }
    return { text: out.join('\n\n'), usage };
  };
  return { generate, prompts, systems, state };
};

const run = (model: ReturnType<typeof makeModel>, docs: KbDocInput[] = DOCS) =>
  generateRichModule({ module: MODULE, moduleNumber: 2, totalModules: 8, catalog: [MODULE], gigContext: 'Gig : assurance santé', kbDocs: docs, languageCode: 'fr', generate: model.generate });

describe('récupération de passages KB', () => {
  it('découpe en fenêtres de 600 à 800 caractères', () => {
    const windows = splitIntoWindows(DOCS[1].content as string);
    expect(windows.length).toBeGreaterThan(1);
    windows.slice(0, -1).forEach((w) => {
      expect(w.length).toBeGreaterThanOrEqual(600);
      expect(w.length).toBeLessThanOrEqual(800);
    });
  });
  it('retient 3 à 6 passages pertinents issus des documents, identifiés S1…', () => {
    const sel = selectKbPassages(DOCS, MODULE);
    expect(sel.status).toBe('ok');
    expect(sel.passages.length).toBeGreaterThanOrEqual(3);
    expect(sel.passages.length).toBeLessThanOrEqual(6);
    expect(sel.passages[0].id).toBe('S1');
    expect(sel.passages.some((p) => /29 €/.test(p.text) || /Santé Essentielle/.test(p.text))).toBe(true);
  });
  it('signale une KB vide', () => {
    expect(selectKbPassages([], MODULE).status).toBe('empty');
    expect(selectKbPassages([{ name: 'vide.txt', content: '' }], MODULE).status).toBe('empty');
  });
});

describe('génération riche avec modèle simulé', () => {
  it('produit la structure complète, cite les sources et ne régénère rien', async () => {
    const model = makeModel();
    const r = await run(model);
    expect(r.conformity.ok).toBe(true);
    expect(r.conformity.sourceIssues).toEqual([]);
    expect(r.regenerated).toEqual([]);
    expect(r.conformity.counts.sections).toBeGreaterThanOrEqual(4);
    expect(r.conformity.counts.sections).toBeLessThanOrEqual(6);
    expect(r.conformity.counts.quizQuestions).toBe(5);
    expect(r.conformity.counts.citations).toBeGreaterThan(0);
    expect(r.markdown).toMatch(/^## Module 2 : /);
    expect(r.markdown).toMatch(/### 🎯 Objectifs/);
    expect(r.markdown).toMatch(/### 💡 Exemples concrets/);
    expect(r.markdown).toMatch(/### 🗂️ Étude de cas/);
    expect(r.markdown).toMatch(/### 🎭 Jeu de rôle/);
    expect(r.markdown).toMatch(/### ✅ Quiz/);
    expect(r.markdown).toMatch(/Réponse : [a-d]/);
    expect(r.markdown).toMatch(/Explication : /);
    expect(r.markdown).toMatch(/### 🧠 Synthèse/);
    expect(r.markdown).toMatch(/### ⚠️ Points d'attention/);
    expect(r.markdown).toMatch(/### ⏱️ Durée estimée\s+\*\*60 minutes\*\*/);
    expect(r.markdown).toMatch(/### 📚 Sources\s+- \[S\d\] /);
    expect(isModuleMarkdownConform(r.markdown).conform).toBe(true);
  });

  it('additionne l’usage réel de tous les appels (facturation)', async () => {
    const model = makeModel();
    const r = await run(model);
    expect(r.calls).toBe(model.prompts.length);
    expect(r.usage.totalTokens).toBe(r.calls * 1500);
    expect(r.usage.estimated).toBe(false);
  });

  it('régénère uniquement les éléments manquants (quiz de 3 QCM, jeu de rôle absent)', async () => {
    const model = makeModel({ shortQuizOnFirstCall: true, noRoleplayOnFirstCall: true });
    const r = await run(model);
    expect(r.regenerated.sort()).toEqual(['quiz', 'roleplay']);
    expect(r.conformity.ok).toBe(true);
    expect(r.conformity.counts.quizQuestions).toBe(5);
    expect(r.calls).toBe(1 + 5 + 2 + 1); // fiche + 5 sections + 2 parties appliquées + 1 régénération ciblée
  });

  it('refuse un prix absent de la KB : régénération ciblée de la section', async () => {
    const model = makeModel({ inventedPriceInSection2OnFirstCall: true });
    const r = await run(model);
    expect(r.regenerated).toEqual(['section:2']);
    expect(r.markdown).not.toMatch(/99 €/);
    expect(r.conformity.sourceIssues).toEqual([]);
  });

  it('autorise un prix présent dans les passages', () => {
    const md = (m: string) => m;
    const base = validateModuleMarkdown(md('## M'), { checkSources: true, passageIds: ['S1'], passageText: 'cotisation de 29 € par mois' });
    expect(base.sourceIssues).toEqual([]);
  });

  it('KB vide : bandeau « contenu général », aucune source, structure complète', async () => {
    const model = makeModel();
    const r = await run(model, []);
    expect(r.kb.status).toBe('empty');
    expect(r.markdown).toMatch(/Base de connaissances vide ou insuffisante/);
    expect(r.markdown).not.toMatch(/\[S\d+\]/);
    expect(r.conformity.ok).toBe(true);
    expect(model.systems[0]).toMatch(/No knowledge-base passage is available/);
  });

  it('respecte la langue demandée', async () => {
    const model = makeModel();
    const r = await generateRichModule({ module: MODULE, moduleNumber: 1, totalModules: 1, kbDocs: DOCS, languageCode: 'en', generate: model.generate });
    expect(r.markdown).toMatch(/### 🎯 Objectives/);
    expect(model.systems[0]).toMatch(/Write everything in English/);
  });
});

describe('aucun plafond de mots dans les prompts de contenu', () => {
  const CAPS = [
    /under\s+~?\d+\s+words/i,
    /\bmax(?:imum)?\s+~?\d+\s+(?:words|mots)/i,
    /\d+\s+(?:words|mots)\s+max/i,
    /moins\s+de\s+\d+\s+mots/i,
    /concise,\s+operational/i,
    /Keep (?:each|this) module under/i,
    /Keep content under/i,
    /\(\d+-\d+ mots max\)/i,
  ];
  it('prompts envoyés au modèle et consignes de structure', async () => {
    const model = makeModel({ shortQuizOnFirstCall: true });
    await run(model);
    const all = [...model.prompts, ...model.systems, ...buildSingleCallStructureInstructions('fr'), ...buildSingleCallStructureInstructions('en')].join('\n');
    CAPS.forEach((re) => expect(all).not.toMatch(re));
    expect(all).toMatch(/no length limit/i);
  });
  it('texte source des prompts de contenu', () => {
    const files = ['controllers/aiController.ts', 'services/gigTrainingGeneratorService.ts', 'services/documentAnalysisService.ts', 'services/richModuleContent.ts'];
    for (const f of files) {
      const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      CAPS.forEach((re) => expect({ f, hit: re.test(src) }).toEqual({ f, hit: false }));
    }
    const ctrl = fs.readFileSync(path.join(__dirname, '..', 'controllers/aiController.ts'), 'utf8');
    expect(ctrl).not.toMatch(/generateWithClaude\(modulePrompt[^)]*2400/);
  });
});

describe('conformité et validation', () => {
  it('un module à l’ancien format (3 sections + quiz) n’est pas conforme', () => {
    const legacy = '## Module 1 : X\n### Section 1 : A\ntexte\n### Section 2 : B\ntexte\n### Quiz\nQ1 : q ?\na) 1\nb) 2\nc) 3\nd) 4\nRéponse : a';
    const r = isModuleMarkdownConform(legacy);
    expect(r.conform).toBe(false);
    expect(r.missing.length).toBeGreaterThan(3);
  });
  it('un texte quelconque n’est pas conforme', () => {
    expect(isModuleMarkdownConform('Bonjour, voici une réponse.').conform).toBe(false);
  });
});

describe('estimation de coût', () => {
  it('croît avec les passages et encadre min/max', () => {
    const small = estimateModuleTokens({ passageChars: 0 });
    const big = estimateModuleTokens({ passageChars: 4800, gigContextChars: 2500 });
    expect(big.totalTokens).toBeGreaterThan(small.totalTokens);
    expect(big.minTokens).toBeLessThan(big.totalTokens);
    expect(big.maxTokens).toBeGreaterThan(big.totalTokens);
    expect(big.calls).toBe(8);
    expect(big.inputTokens + big.outputTokens).toBe(big.totalTokens);
  });
});

describe('compatibilité avec le parseur de sections existant', () => {
  it('extrait sections et quiz (5 QCM avec explications) du module généré', async () => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-no-network';
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key-no-network';
    const { parseModuleSectionsFromMarkdown } = require('../controllers/aiController');
    const r = await run(makeModel());
    const parsed = parseModuleSectionsFromMarkdown(r.markdown);
    expect(parsed.sections.length).toBeGreaterThanOrEqual(10);
    expect(parsed.quizzes).toHaveLength(1);
    const qs = parsed.quizzes[0].questions;
    expect(qs).toHaveLength(5);
    qs.forEach((q: any) => {
      expect(q.options).toHaveLength(4);
      expect(q.explanation).toBeTruthy();
      expect(q.question).not.toMatch(/^Q\d/);
    });
    expect(qs[1].correctAnswer).toBe(1);
  });
});
