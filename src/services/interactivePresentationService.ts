import aiService from './aiService';

export type InteractiveTransformResult = {
  pedagogicalPlan: Record<string, any>;
  presentationPlan: Record<string, any>;
  model: string;
  generatedAt: string;
};

const MODEL_SLUG = 'claude-sonnet-4-5';

const isNonEmptyString = (v: any): v is string => typeof v === 'string' && v.trim().length > 0;

const validatePedagogicalPlan = (raw: any): raw is Record<string, any> => {
  if (!raw || typeof raw !== 'object') return false;
  if (!Array.isArray(raw.slides) || raw.slides.length < 3) return false;
  return raw.slides.every(
    (s: any) =>
      s &&
      typeof s === 'object' &&
      isNonEmptyString(s.id) &&
      isNonEmptyString(s.title) &&
      Array.isArray(s.keyPoints) &&
      s.keyPoints.length >= 2
  );
};

const validatePresentationPlan = (raw: any): raw is Record<string, any> => {
  if (!raw || typeof raw !== 'object') return false;
  if (!Array.isArray(raw.screens) || raw.screens.length < 3) return false;
  return raw.screens.every(
    (s: any) =>
      s &&
      typeof s === 'object' &&
      isNonEmptyString(s.id) &&
      isNonEmptyString(s.screenType) &&
      Array.isArray(s.components)
  );
};

const parseOrRepairJson = async (raw: string, label: string): Promise<Record<string, any>> => {
  try {
    return aiService.parseJson(raw, label, { suppressLogs: true }) as Record<string, any>;
  } catch {
    const repairPrompt = [
      `Le texte ci-dessous doit etre converti en JSON strict pour ${label}.`,
      'Retourne UNIQUEMENT le JSON valide, sans markdown, sans commentaire.',
      'Conserve les donnees et corrige uniquement la syntaxe.',
      '',
      raw,
    ].join('\n');
    const repaired = await aiService.generateWithClaude(
      repairPrompt,
      'You are a strict JSON repairer. Return valid JSON only.',
      undefined,
      3000,
      { temperature: 0.0, preferredModels: [MODEL_SLUG] }
    );
    return aiService.parseJson(repaired, `${label}_repaired`, { suppressLogs: true }) as Record<string, any>;
  }
};

export const generateInteractivePresentationFromModule = async (params: {
  moduleTitle: string;
  moduleMarkdown: string;
  methodologyName?: string;
  language?: 'fr' | 'en';
}): Promise<InteractiveTransformResult> => {
  const moduleTitle = String(params.moduleTitle || 'Module').trim();
  const moduleMarkdown = String(params.moduleMarkdown || '').trim();
  if (!moduleMarkdown) {
    throw new Error('Module markdown is required for interactive transformation.');
  }
  const language = params.language || 'fr';
  const methodologyName = String(params.methodologyName || 'Methodologie 360').trim();

  const pedagogicalPrompt = [
    `Transforme ce contenu de formation en plan pedagogique structure (${language}).`,
    'Retourne STRICTEMENT un JSON valide avec ce schema:',
    JSON.stringify({
      moduleTitle: 'string',
      language: language,
      slides: [
        {
          id: 'string',
          title: 'string',
          objective: 'string',
          keyPoints: ['string'],
          interactionHint: 'none|quiz|scenario|poll|hotspot',
          checkpointQuestion: 'string',
        },
      ],
      interactions: [
        {
          id: 'string',
          type: 'quiz|scenario|poll|hotspot',
          prompt: 'string',
          options: [{ id: 'string', label: 'string', isCorrect: true }],
          rationale: 'string',
        },
      ],
      completionCriteria: ['string'],
    }),
    'Regles:',
    '- 5 a 9 slides.',
    '- Garder uniquement les informations pedagogiques actionnables.',
    '- Pas de prose hors JSON.',
    '',
    `Methodologie: ${methodologyName}`,
    `Titre module: ${moduleTitle}`,
    '',
    'Contenu module source:',
    moduleMarkdown.slice(0, 12000),
  ].join('\n');

  const pedagogicalRaw = await aiService.generateWithClaude(
    pedagogicalPrompt,
    'Tu es un architecte pedagogique e-learning. Return valid JSON only.',
    undefined,
    3500,
    { temperature: 0.2, preferredModels: [MODEL_SLUG] }
  );
  const pedagogicalPlan = await parseOrRepairJson(pedagogicalRaw, 'interactive_pedagogical_plan');
  if (!validatePedagogicalPlan(pedagogicalPlan)) {
    throw new Error('Pedagogical plan JSON is invalid.');
  }

  const presentationPrompt = [
    `Convertis ce plan pedagogique en presentation interactive (${language}).`,
    'Retourne STRICTEMENT un JSON valide avec ce schema:',
    JSON.stringify({
      version: 'InteractivePresentationV1',
      moduleTitle: moduleTitle,
      screens: [
        {
          id: 'string',
          screenType: 'intro|content|quiz|scenario|summary',
          title: 'string',
          components: [
            {
              type: 'heading|paragraph|bullet-list|mcq|poll|decision-tree|hotspot',
              props: {},
            },
          ],
          navigation: { next: 'string|null', lockedUntil: 'string|null' },
        },
      ],
      scoring: {
        mode: 'points',
        passingScore: 70,
        rules: [{ interactionId: 'string', pointsIfCorrect: 10 }],
      },
    }),
    'Regles:',
    '- 1 screen intro, 1 screen summary, et au moins 1 screen interactive (quiz/scenario/poll/hotspot).',
    '- Maximum 6 screens au total.',
    '- Maximum 4 composants par screen.',
    '- Chaque texte de composant <= 220 caracteres.',
    '- Reponse compacte: pas de contenu redondant.',
    '- Pas de markdown.',
    '- Pas de texte hors JSON.',
    '',
    'Plan pedagogique JSON:',
    JSON.stringify(pedagogicalPlan).slice(0, 12000),
  ].join('\n');

  const presentationRaw = await aiService.generateWithClaude(
    presentationPrompt,
    'You are an expert instructional UI architect. Return valid JSON only.',
    undefined,
    3500,
    { temperature: 0.15, preferredModels: [MODEL_SLUG] }
  );
  const presentationPlan = await parseOrRepairJson(presentationRaw, 'interactive_presentation_plan');
  if (!validatePresentationPlan(presentationPlan)) {
    throw new Error('Presentation plan JSON is invalid.');
  }

  return {
    pedagogicalPlan,
    presentationPlan,
    model: MODEL_SLUG,
    generatedAt: new Date().toISOString(),
  };
};

