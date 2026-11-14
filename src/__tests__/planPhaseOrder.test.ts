import { sortPlanMarkdownByPhase, parseModulePhase, inferPhaseFromTitle } from '../utils/planPhaseOrder';

const mod = (n: number, title: string, phase?: string) =>
  [`## Module ${n} : ${title}`, ...(phase ? [`Phase : ${phase}`] : []), '### 🎯 Objectifs', '- Objectif A', '- Objectif B', '- Objectif C', '### 📌 Key Topics', '- Sujet 1', '- Sujet 2', '- Sujet 3', ''].join('\n');
const titles = (md: string) => Array.from(md.matchAll(/^## Module (\d+) : (.+)$/gm)).map((m) => `${m[1]}:${m[2]}`);

describe('ordre logique des modules par phase', () => {
  it('la sécurité sociale (contexte) vient en tête, avant l’offre et la prospection ; la conformité légale reste après la prospection', () => {
    const md = [
      mod(1, 'Offres et garanties', 'offre'),
      mod(2, 'Système de sécurité sociale', 'contexte'),
      mod(3, 'Prospection et objections', 'prospection'),
      mod(4, 'Règles légales de la vente', 'conformite'),
      mod(5, 'Suivi client', 'suivi'),
    ].join('\n');
    expect(titles(sortPlanMarkdownByPhase(md))).toEqual([
      '1:Système de sécurité sociale',
      '2:Offres et garanties',
      '3:Prospection et objections',
      '4:Règles légales de la vente',
      '5:Suivi client',
    ]);
  });

  it('tri stable : à phase égale, l’ordre d’origine est conservé', () => {
    const md = [mod(1, 'B1', 'offre'), mod(2, 'A1', 'contexte'), mod(3, 'B2', 'offre'), mod(4, 'A2', 'contexte')].join('\n');
    expect(titles(sortPlanMarkdownByPhase(md)).map((t) => t.split(':')[1])).toEqual(['A1', 'A2', 'B1', 'B2']);
  });

  it('les modules sans phase gardent leur place', () => {
    const md = [mod(1, 'Suivi', 'suivi'), mod(2, 'Sans phase'), mod(3, 'Offre', 'offre'), mod(4, 'Sans phase bis'), mod(5, 'Contexte', 'contexte')].join('\n');
    expect(titles(sortPlanMarkdownByPhase(md))).toEqual(['1:Contexte', '2:Sans phase', '3:Offre', '4:Sans phase bis', '5:Suivi']);
  });

  it('renumérote, retire les lignes de phase et conserve le contenu des modules', () => {
    const md = [mod(1, 'Conformité', 'conformité'), mod(2, 'Offre', 'offre')].join('\n');
    const out = sortPlanMarkdownByPhase(md);
    expect(out).not.toMatch(/Phase\s*:/i);
    expect(out.indexOf('Offre')).toBeLessThan(out.indexOf('Conformité'));
    expect(out.match(/- Objectif A/g)).toHaveLength(2);
    expect(sortPlanMarkdownByPhase(md, { stripPhaseLines: false })).toMatch(/Phase : offre/);
  });

  it('accepte accents, gras et casse ; ignore une phase inconnue', () => {
    expect(parseModulePhase(['**Phase :** Conformité'])).toBe('conformite');
    expect(parseModulePhase(['- Phase : OFFRE'])).toBe('offre');
    expect(parseModulePhase(['Phase : inconnue'])).toBeNull();
    expect(parseModulePhase(['Pas de phase ici'])).toBeNull();
  });

  it('inchangé sans phase, avec un seul module, ou conserve le préambule', () => {
    const noPhase = [mod(1, 'A'), mod(2, 'B')].join('\n');
    expect(sortPlanMarkdownByPhase(noPhase)).toBe(noPhase);
    const single = mod(1, 'Seul', 'suivi');
    expect(sortPlanMarkdownByPhase(single)).toBe(single);
    const withPre = `Intro du plan\n\n${[mod(1, 'Z', 'suivi'), mod(2, 'Y', 'contexte')].join('\n')}`;
    expect(sortPlanMarkdownByPhase(withPre).startsWith('Intro du plan')).toBe(true);
  });

  it('le plan enregistré suit l’ordre trié (extraction du plan depuis le markdown)', () => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key-no-network';
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'test-key-no-network';
    const { extractModulePlanFromAssistantMarkdown } = require('../utils/chatPlanValidation');
    const md = [mod(1, 'Cadre légal', 'conformite'), mod(2, 'Offre santé', 'offre'), mod(3, 'Contexte', 'contexte')].join('\n');
    const plan = extractModulePlanFromAssistantMarkdown(md);
    expect(plan.map((m: any) => m.title)).toEqual(['Module 1 - Contexte', 'Module 2 - Offre santé', 'Module 3 - Cadre légal']);
  });
});

describe('repli : phase déduite du titre (sans ligne Phase)', () => {
  it.each([
    ['Système de sécurité sociale', 'contexte'],
    ['Le système de santé en France', 'contexte'],
    ['Introduction et marché', 'contexte'],
    ['Garanties et produits', 'offre'],
    ['Notre offre santé', 'offre'],
    ['Techniques d’appel et objections', 'prospection'],
    ['Prospection téléphonique', 'prospection'],
    ['Cadre légal et RGPD', 'conformite'],
    ['Démarchage : règles et consentement', 'conformite'],
    ['Suivi client et KPI', 'suivi'],
    ['Optimisation continue', 'suivi'],
  ])('« %s » → %s', (title, phase) => {
    expect(inferPhaseFromTitle(title)).toBe(phase);
  });

  it('titre sans mot-clé → pas de phase ; le mot-clé le plus tôt l’emporte', () => {
    expect(inferPhaseFromTitle('Posture professionnelle')).toBeNull();
    expect(inferPhaseFromTitle('Sécurité sociale et cadre légal')).toBe('contexte');
  });

  it('trie un plan SANS ligne Phase d’après les titres (sécurité sociale en tête)', () => {
    const md = [
      mod(1, 'Garanties et produits'),
      mod(2, 'Techniques d’appel et objections'),
      mod(3, 'Système de sécurité sociale'),
      mod(4, 'Suivi client et KPI'),
      mod(5, 'Cadre légal et RGPD'),
    ].join('\n');
    expect(titles(sortPlanMarkdownByPhase(md)).map((t) => t.split(':')[1])).toEqual([
      'Système de sécurité sociale',
      'Garanties et produits',
      'Techniques d’appel et objections',
      'Cadre légal et RGPD',
      'Suivi client et KPI',
    ]);
  });

  it('la phase émise par le modèle prime sur la déduction ; titre non reconnu garde sa place', () => {
    const md = [mod(1, 'Posture professionnelle'), mod(2, 'Garanties', 'contexte'), mod(3, 'Suivi client')].join('\n');
    expect(titles(sortPlanMarkdownByPhase(md)).map((t) => t.split(':')[1])).toEqual(['Posture professionnelle', 'Garanties', 'Suivi client']);
    const md2 = [mod(1, 'Suivi client'), mod(2, 'Posture professionnelle'), mod(3, 'Garanties', 'contexte')].join('\n');
    expect(titles(sortPlanMarkdownByPhase(md2)).map((t) => t.split(':')[1])).toEqual(['Garanties', 'Posture professionnelle', 'Suivi client']);
  });
});

