import mongoose from 'mongoose';
import documentParserService from './documentParserService';
import aiService from './aiService';
import { AppError } from '../middleware/errorHandler';
import Document from '../models/Document';

interface DocumentAnalysisResult {
  extractedContent: {
    text: string;
    keyTopics: string[];
    complexity: number;
  };
  aiAnalysis: {
    readabilityScore: number;
    keyConceptsExtracted: string[];
    suggestedLearningObjectives: string[];
    recommendedModuleStructure: string[];
    contentGaps: string[];
    engagementScore: number;
    improvementSuggestions: Array<{
      type: 'media' | 'interactivity' | 'content' | 'assessment';
      priority: 'low' | 'medium' | 'high' | 'critical';
      suggestion: string;
      implementation: string;
      expectedImpact: string;
    }>;
    mediaRecommendations: Array<{
      type: 'video' | 'audio' | 'image' | 'infographic';
      purpose: string;
      description: string;
      priority: number;
    }>;
  };
}

class DocumentAnalysisService {
  async analyzeDocument(filePath: string, fileType: string, apiKey?: string): Promise<DocumentAnalysisResult> {
    try {
      const text = await documentParserService.parseDocument(filePath, fileType);
      
      const analysisPrompt = `
        Tu es un analyste expert en formation et ingénierie pédagogique. 
        Analyse le texte suivant extrait d'un document source pour en extraire une structure de formation de haute qualité.
        
        TEXTE SOURCE :
        ${text.substring(0, 30000)} 

        TON OBJECTIF :
        Réliser un AUDIT PÉDAGOGIQUE PROFOND. Identifie :
        1. Personas d'apprentissage : À qui s'adresse ce contenu ? Quels sont leurs besoins ?
        2. Niveaux de la Taxonomie de Bloom : Quels niveaux de maîtrise sont visés (Connaissance, Application, Analyse, etc.) ?
        3. Lacunes de connaissances : Que manque-t-il dans ce texte pour une formation complète ?
        4. Points d'accroche interactifs : Où insérer des quiz ou des exercices ?

        Le résultat DOIT être un objet JSON valide (SANS AUCUN COMMENTAIRE) avec cette structure exacte, et chaque tableau DOIT être limité à MAXIMUM 5 à 7 éléments les plus importants :
        {
          "readabilityScore": 85,
          "keyConceptsExtracted": ["Concept A", "Concept B"],
          "suggestedLearningObjectives": ["Objectif 1", "Objectif 2"],
          "recommendedModuleStructure": ["Module 1", "Module 2"],
          "contentGaps": ["Manque 1"],
          "engagementScore": 75,
          "improvementSuggestions": [
            {
              "type": "media",
              "priority": "high",
              "suggestion": "...",
              "implementation": "...",
              "expectedImpact": "..."
            }
          ],
          "mediaRecommendations": [
            {
              "type": "video",
              "purpose": "...",
              "description": "...",
              "priority": 8
            }
          ]
        }
        
        CRITIQUE : Sois très concis. Ne génère pas de longues listes.
        Réponds UNIQUEMENT avec l'objet JSON valide sans texte avant ni après, et SANS commentaires (//).
      `;

      const aiResponse = await aiService.generateWithClaude(
        analysisPrompt,
        "Tu es un expert en formation. Réponds uniquement en JSON valide.",
        apiKey
      );

      const aiAnalysisRaw = aiService.parseJson(aiResponse, 'document_analysis');
      
      // Legacy compatibility mapping
      const readability = aiAnalysisRaw.readabilityScore || 85;
      const complexity = aiAnalysisRaw.engagementScore || 75;
      
      // Ensure all required fields exist with defaults to prevent UI crashes
      const aiAnalysis = {
        ...aiAnalysisRaw,
        // Legacy keys for UI compatibility
        keyTopics: aiAnalysisRaw.keyConceptsExtracted || aiAnalysisRaw.keyTopics || [],
        difficulty: Math.round(10 - (readability / 10)),
        estimatedReadTime: Math.max(1, Math.round(text.length / 1000)),
        suggestedModules: aiAnalysisRaw.recommendedModuleStructure || aiAnalysisRaw.suggestedModules || [],
        
        // Standard fields
        readabilityScore: readability,
        keyConceptsExtracted: aiAnalysisRaw.keyConceptsExtracted || [],
        suggestedLearningObjectives: aiAnalysisRaw.suggestedLearningObjectives || [],
        recommendedModuleStructure: aiAnalysisRaw.recommendedModuleStructure || [],
        contentGaps: aiAnalysisRaw.contentGaps || [],
        engagementScore: complexity,
        improvementSuggestions: aiAnalysisRaw.improvementSuggestions || [],
        mediaRecommendations: aiAnalysisRaw.mediaRecommendations || []
      };

      return {
        extractedContent: {
          text: text.substring(0, 5000), // Return a sample for the UI
          keyTopics: aiAnalysis.keyConceptsExtracted.slice(0, 5),
          complexity: aiAnalysisRaw.complexity || 5
        },
        aiAnalysis
      };
    } catch (error: any) {
      console.error('Document analysis error:', error);
      throw new AppError(`Failed to analyze document: ${error.message || String(error)}`, 500);
    }
  }

  async generateTrainingProgram(analysis: any, apiKey?: string): Promise<any> {
    try {
      console.log('🚀 Starting Multiphase Program Generation (program-generator method)');
      const analysisContext = typeof analysis === 'string' ? analysis : JSON.stringify(analysis);
      
      // ── Call 1: Program metadata + module plan (no sessions yet) ──────────
      const metaPrompt = `Tu es un expert en conception pédagogique.
        CONTEXTE D'ANALYSE:
        ${analysisContext.slice(0, 5000)}

        Génère UNIQUEMENT les métadonnées du programme et la liste des modules (sans détailler les sessions).
        Réponds en JSON valide uniquement, sans markdown :
        {
          "title": "Titre du programme",
          "subtitle": "Sous-titre accrocheur",
          "description": "Description en 2-3 phrases",
          "duration": "Durée totale recommandée",
          "level": "Niveau",
          "objectives": ["objectif 1", "objectif 2", "objectif 3", "objectif 4"],
          "prerequisites": ["prérequis 1", "prérequis 2"],
          "targetAudience": "Description du public cible",
          "methodology": "Description de la méthodologie pédagogique",
          "modules": [
            { "id": 1, "title": "Titre module 1", "duration": "2h", "description": "Description courte" },
            { "id": 2, "title": "Titre module 2", "duration": "2h", "description": "Description courte" }
          ],
          "visualTheme": {
            "primaryColor": "#HEX",
            "secondaryColor": "#HEX",
            "accentColor": "#HEX",
            "fontFamily": "font-name",
            "layoutStyle": "modern|corporate|creative"
          }
        }`;

      const metaRaw = await aiService.generateWithClaude(metaPrompt, "Return ONLY valid JSON metadata.", apiKey);
      const meta = aiService.parseJson(metaRaw, 'program_metadata');
      const modulePlan = meta.modules || [];

      if (modulePlan.length === 0) return meta;

      // ── Call 2: Detailed sessions for each module ─────────────────────────
      // Generate sessions individually in parallel to respect max_tokens limits strictly
      const makeSessionPrompt = (m: any) => `Tu es un expert en conception pédagogique.
        Thème : ${meta.title}
        Durée globale : ${meta.duration}
        
        Pour le module spécifique suivant, génère les sessions détaillées et les sections de contenu associées.
        CRITIQUE: Pour éviter de dépasser la limite de tokens, tu DOIS te limiter à MAXIMUM 2 sections et 1 quiz de 3 questions maximum. Le contenu doit être concis (150 mots max par section).
        
        Réponds en JSON valide uniquement, avec cette structure exacte (SANS commentaires), sans texte avant ou après :
        {
          "module": {
            "id": ${m.id},
            "title": "${m.title}",
            "duration": "${m.duration}",
            "description": "Description détaillée courte",
            "learningObjectives": ["Obj 1", "Obj 2"],
            "sections": [
              {
                "title": "Titre explicite",
                "content": "Contenu pédagogique concis en Markdown (100-150 mots max)",
                "type": "text",
                "duration": 20,
                "imageDescription": "Description visuelle détaillée pour génération d'image"
              }
            ],
            "quizzes": [
              {
                "title": "Validation des acquis",
                "questions": [
                  { "question": "Q?", "options": ["A", "B", "C"], "correctAnswer": 0, "explanation": "..." }
                ]
              }
            ],
            "imageDescription": "Description visuelle du module"
          }
        }

        Identité du Module à détailler :
        Titre: ${m.title}
        Durée prévue: ${m.duration}
        Résumé: ${m.description}`;

      const detailedModulesPromises = modulePlan.map(async (m: any) => {
        try {
          const raw = await aiService.generateWithClaude(makeSessionPrompt(m), "Return ONLY valid JSON for this module.", apiKey);
          const parsed = aiService.parseJson(raw, `program_session_module_${m.id}`);
          return parsed.module || m;
        } catch (e) {
          console.error(`⚠️ Fallback for module ${m.id} details:`, e);
          return m; // Return basic metadata if detail generation fails
        }
      });

      const detailedModules = await Promise.all(detailedModulesPromises);

      const program = {
        ...meta,
        modules: detailedModules.length > 0 ? detailedModules : modulePlan
      };

      console.log('✅ Iterative Program Generation Complete');
      return program;
    } catch (error) {
      console.error('❌ Program generation error:', error);
      throw new AppError('Failed to generate high-quality program', 500);
    }
  }

  /**
   * Texte pédagogique exploitable (sections) — évite JSON.stringify tronqué qui noie le contenu KB.
   */
  private buildProgramNarrativeContext(program: any, maxChars: number): string {
    const lines: string[] = [];
    lines.push(`TITRE PROGRAMME: ${program.title || program.name || ''}`);
    if (program.description) lines.push(`DESCRIPTION: ${program.description}`);
    if (Array.isArray(program.objectives) && program.objectives.length) {
      lines.push(`OBJECTIFS: ${program.objectives.join(' | ')}`);
    }
    const mods = program.modules || [];
    for (let i = 0; i < mods.length; i++) {
      const m = mods[i];
      lines.push(`\n—— MODULE ${i + 1}: ${m.title || ''} ——`);
      if (m.description) lines.push(`Résumé module: ${m.description}`);
      if (Array.isArray(m.learningObjectives) && m.learningObjectives.length) {
        lines.push(`Objectifs module: ${m.learningObjectives.join('; ')}`);
      }
      const sections = m.sections || [];
      for (const s of sections) {
        const st = s.title || s.type || 'Section';
        let body = '';
        if (typeof s.content === 'string') body = s.content;
        else if (s.content && typeof s.content === 'object') {
          const c = s.content as Record<string, unknown>;
          body =
            (typeof c.text === 'string' && c.text) ||
            (typeof c.markdown === 'string' && c.markdown) ||
            '';
          if (!body) body = JSON.stringify(s.content).slice(0, 4000);
        }
        lines.push(`\n[${st}]\n${body}`);
      }
    }
    let text = lines.join('\n');
    if (text.length > maxChars) {
      text = text.slice(0, maxChars) + '\n[…tronqué — priorité au début du programme…]';
    }
    return text;
  }

  /**
   * Nombre de slides à générer : dérivé du curriculum (modules / sections), pas une constante fixe.
   * Surcharge possible via options.targetSlideCount (bornée 8–40).
   */
  private computePresentationSlideTarget(
    program: any,
    options?: { targetSlideCount?: number }
  ): number {
    const explicit = options?.targetSlideCount;
    if (typeof explicit === 'number' && Number.isFinite(explicit)) {
      return Math.max(8, Math.min(40, Math.round(explicit)));
    }
    const mods = Array.isArray(program?.modules) ? program.modules : [];
    if (mods.length === 0) return 14;
    let sectionCount = 0;
    for (const m of mods) {
      sectionCount += Array.isArray(m?.sections) ? m.sections.length : 0;
    }
    const raw = 10 + mods.length * 2 + Math.min(12, Math.ceil(sectionCount / 2));
    return Math.max(10, Math.min(30, raw));
  }

  /** Une consigne par slide, indices 1..n, alignée sur le programme (titres de modules quand disponibles). */
  private buildSlideLineItems(n: number, program: any): string[] {
    if (n < 4) {
      return Array.from(
        { length: n },
        (_, i) =>
          `Slide ${i + 1} : Synthèse de formation — message clair et professionnel, aligné sur le programme.`
      );
    }
    const modules = Array.isArray(program?.modules) ? program.modules : [];
    const titles = modules.map((m: any) => String(m?.title || 'Module').slice(0, 100));

    const plan: string[] = [];
    plan.push('Slide de titre — accroche impactante, slogan fort, chiffre clé du domaine.');
    plan.push('Contexte et problématique — statistiques, enjeux actuels, chiffres de référence.');
    const middle = Math.max(0, n - 4);
    const expertiseLine = (idx: number): string => {
      if (titles.length) {
        const t = titles[idx % titles.length];
        const phase = Math.floor(idx / titles.length) % 3;
        if (phase === 0) return `Module « ${t} » — objectifs, définitions et points clés.`;
        if (phase === 1) return `Module « ${t} » — exemples, données et mise en pratique.`;
        return `Module « ${t} » — synthèse opérationnelle pour le terrain.`;
      }
      const pool = [
        'Concepts et mécanismes — précision métier d’après le programme.',
        'Comparatifs, typologies ou offres — structuration claire.',
        'Bénéfices, limites et bonnes pratiques — équilibre pédagogique.',
        'Cas pratique ou scénario — chiffres et étapes concrètes.',
        'Contexte actuel, innovations ou perspectives — selon les sources.',
      ];
      return pool[idx % pool.length];
    };
    for (let i = 0; i < middle; i++) plan.push(expertiseLine(i));
    plan.push('Conclusion synthétique — récapitulatif et messages clés.');
    plan.push('Prochaines étapes (call to action) — ce que fait le public après la formation.');
    return plan.map((desc, i) => `Slide ${i + 1} : ${desc}`);
  }

  /** Même logique que la génération Gig, avec extraits texte source larges pour les slides. */
  private async buildKbContextForGig(gigId: string): Promise<string> {
    const documents = await Document.find({ gigId }).sort({ createdAt: -1 });
    if (!documents.length) return '';
    const maxTotal = 48000;
    const chunks: string[] = [];
    let total = 0;
    documents.forEach((doc, idx) => {
      if (total >= maxTotal) return;
      const analysis = doc.analysis;
      const summary = analysis?.summary || '';
      const points = (analysis?.mainPoints || []).join('\n- ');
      const terms = (analysis?.keyTerms || []).join(', ');
      const raw = doc.content || '';
      const remaining = maxTotal - total - 500;
      const excerptLen = Math.min(12000, Math.max(0, remaining - summary.length - (points?.length || 0)));
      const excerpt = raw.slice(0, excerptLen);
      let block =
        `[DOCUMENT ${idx + 1}: ${doc.name}]\n` +
        `SYNTHÈSE (analyse) : ${summary}\n` +
        (excerpt
          ? `EXTRAIT TEXTE SOURCE (définitions, articles, exemples — à citer ou paraphraser) :\n${excerpt}\n`
          : '') +
        (points ? `POINTS CLÉS :\n- ${points}\n` : '') +
        (terms ? `MOTS CLÉS : ${terms}\n` : '');
      if (total + block.length > maxTotal) {
        block = block.slice(0, Math.max(0, maxTotal - total));
      }
      total += block.length;
      if (block.trim()) chunks.push(block);
    });
    return chunks.join('\n---\n');
  }

  async generatePresentation(
    program: any,
    apiKey?: string,
    options?: {
      gigId?: string;
      useKnowledgeBase?: boolean;
      includeCallRecordings?: boolean;
      sourceContext?: any;
      sourceMode?: string;
      /** Optional override; sinon le nombre de slides est déduit du curriculum. */
      targetSlideCount?: number;
    }
  ): Promise<any> {
    try {
      const slideTarget = this.computePresentationSlideTarget(program, options);
      const lineItems = this.buildSlideLineItems(slideTarget, program);
      const batchCount = Math.min(4, Math.max(1, lineItems.length));
      const chunkSize = Math.ceil(lineItems.length / batchCount);
      console.log(
        `🚀 MÉTHODE 360° presentation: ${slideTarget} slides (from program), ${batchCount} parallel batches (chunk ~${chunkSize})`
      );

      let kbPromptFragment = '';
      if (options?.gigId && options?.useKnowledgeBase === true) {
        try {
          kbPromptFragment = await this.buildKbContextForGig(String(options.gigId));
          console.log(
            `📚 generate-presentation: KB injectée pour gig ${options.gigId} (${kbPromptFragment.length} caractères)`
          );
        } catch (e) {
          console.error('❌ generate-presentation: échec chargement KB gig:', e);
        }
      }

      const sourceContext = options?.sourceContext && typeof options.sourceContext === 'object'
        ? options.sourceContext
        : null;
      const sourceMode = (options?.sourceMode || sourceContext?.sourceMode || '').toString();

      const uploadAnalyses = Array.isArray(sourceContext?.uploadAnalyses) ? sourceContext.uploadAnalyses : [];
      const knowledgeDocuments = Array.isArray(sourceContext?.knowledgeDocuments) ? sourceContext.knowledgeDocuments : [];
      const callRecordings = Array.isArray(sourceContext?.callRecordings) ? sourceContext.callRecordings : [];
      const isCallRecordingUsable = (call: any): boolean => {
        const status = String(call?.transcriptionStatus || '').toLowerCase();
        const hasFailedTranscription = status === 'failed';
        const summary = String(call?.summaryText || '').toLowerCase();
        const keyIdeas = Array.isArray(call?.keyIdeas) ? call.keyIdeas : [];
        const keyIdeasText = keyIdeas
          .map((k: any) => `${k?.title || ''} ${k?.description || ''}`)
          .join(' ')
          .toLowerCase();
        const text = `${summary} ${keyIdeasText}`;
        const hasInsuranceSignal = /(assurance|mutuelle|contrat|sant[eé]|prospect|objection|closing|garantie|remboursement)/i.test(text);
        const obviouslyOffTopic = /(bakery|croissant|baguette|pain au chocolat|seller|6 euros)/i.test(text);
        if (obviouslyOffTopic) return false;
        if (hasFailedTranscription && !hasInsuranceSignal) return false;
        return text.trim().length > 0;
      };
      const usableCallRecordings = callRecordings.filter(isCallRecordingUsable);

      const uploadContextBlock = uploadAnalyses.length
        ? `ANALYSES DES DOCUMENTS UPLOADÉS (source explicite):\n${uploadAnalyses
            .map((u: any, i: number) => {
              const topics = Array.isArray(u?.keyTopics) ? u.keyTopics.join(', ') : '';
              const objectives = Array.isArray(u?.learningObjectives) ? u.learningObjectives.join(' | ') : '';
              return `[UPLOAD ${i + 1}] ${u?.fileName || 'Untitled'} (${u?.fileType || 'unknown'})\n- Topics: ${topics}\n- Learning objectives: ${objectives}`;
            })
            .join('\n')}\n`
        : '';

      const kbDocsContextBlock = knowledgeDocuments.length
        ? `DOCUMENTS KB (source explicite):\n${knowledgeDocuments
            .map((d: any, i: number) => {
              const terms = Array.isArray(d?.keyTerms) ? d.keyTerms.join(', ') : '';
              return `[KB ${i + 1}] ${d?.name || 'Untitled'} (${d?.fileType || 'unknown'})\n- Summary: ${d?.summary || ''}\n- Key terms: ${terms}`;
            })
            .join('\n')}\n`
        : '';

      const callRecordingsBlock = usableCallRecordings.length
        ? `CALL RECORDINGS LIÉS AU GIG (source explicite, filtrés qualité):\n${usableCallRecordings
            .map((c: any, i: number) => {
              const keyIdeas = Array.isArray(c?.keyIdeas)
                ? c.keyIdeas
                    .map((k: any) => `${k?.title || ''}${k?.description ? `: ${k.description}` : ''}`)
                    .join(' | ')
                : '';
              return `[CALL ${i + 1}] id=${c?._id || 'unknown'} duration=${c?.duration ?? 'n/a'}s transcriptionStatus=${c?.transcriptionStatus || 'unknown'}\n- Summary: ${c?.summaryText || ''}\n- Key ideas: ${keyIdeas}`;
            })
            .join('\n')}\n`
        : '';

      const sourceContextBlock =
        uploadContextBlock || kbDocsContextBlock || callRecordingsBlock
          ? `\nSOURCE CONTEXT (PRIORITY DATASET FOR THIS GENERATION)\n- sourceMode: ${sourceMode || 'unspecified'}\n- includeCallRecordings: ${options?.includeCallRecordings === true ? 'true' : 'false'}\n- usableCallRecordings: ${usableCallRecordings.length}/${callRecordings.length}\n${uploadContextBlock}${kbDocsContextBlock}${callRecordingsBlock}\n`
          : '';

      const narrative = this.buildProgramNarrativeContext(program, 26000);
      const programInfo = `
        PROGRAMME : ${program.title || program.name || ''}
        OBJECTIFS : ${(program.objectives || []).join(', ')}
        STRUCTURE (modules) : ${(program.modules || []).map((m: any) => `${m.id ?? ''}: ${m.title}`).join(' | ')}

        CONTENU PÉDAGOGIQUE DÉTAILLÉ (modules et sections — utiliser comme squelette, complété par la KB si fournie) :
        ${narrative}
      `;

      const kbBlock = kbPromptFragment
        ? `BASE DE CONNAISSANCES — PRIORITÉ ABSOLUE pour les faits, définitions, exemples, vocabulaire et chiffres des slides :\n${kbPromptFragment}\n\n`
        : '';

      const presentationMaxTokens = parseInt(process.env.ANTHROPIC_PRESENTATION_MAX_TOKENS || '16384', 10);
      const presentationTemperature = parseFloat(process.env.ANTHROPIC_PRESENTATION_TEMPERATURE || '0.5');
      const presentationModelEnv = process.env.ANTHROPIC_PRESENTATION_MODEL?.trim();
      const presentationClaudeOptions = {
        temperature: presentationTemperature,
        ...(presentationModelEnv ? { preferredModels: [presentationModelEnv] } : {})
      };

      /** Style « artefact » proche de l’expérience Claude.app : clarté, densité, pas de remplissage. */
      const presentationSystemPrompt = `Tu produis des slides au niveau d’un artefact Claude (application Claude) : rédaction impeccable, structurée, professionnelle, sans phrases creuses ni clichés « corporate » vides.

STYLE & QUALITÉ (comme un document Claude de référence) :
- Une seule idée dominante par slide ; titre fort et court (≤ 14 mots) qui porte cette idée.
- Corps : soit 2 à 4 phrases courtes et informatives, soit 3 à 5 puces au parallélisme grammatical ; ne répète pas le titre.
- Précision : termes métier corrects, exemples et chiffres tirés du contexte (programme / KB), pas de généralités interchangeables.
- Ton : expert accessible, confiant, légèrement chaleureux — comme une excellente réponse Claude.
- Quiz : question claire, 4 choix dont un seul correct, explication pédagogique utile.
- Langue : écrire dans la langue dominante des sources (ici privilégier le français si les sources sont majoritairement en français). Interdiction de mélange FR/EN dans une même slide.
- Interdiction de contenu hors domaine : ignorer toute source hors sujet (ex. commerce alimentaire/bakery) même si présente dans un enregistrement.

SORTIE : uniquement un objet JSON valide {"slides":[...]} — aucun markdown, aucun \`\`\`, aucun commentaire avant ou après.`;

      const generateBatch = async (label: string, slideDescriptions: string, _startId: number) => {
        const prompt = `Rôle : LEAD INSTRUCTIONAL DESIGNER HARX — présentation méthode 360°, qualité « artefact Claude ».

          ${kbBlock}${sourceContextBlock}CONTEXTE DU PROGRAMME :
          ${programInfo}

          LOT À GÉNÉRER (${label}) — slides dans cet ordre exact, contenu expert et concis :
          ${slideDescriptions}

          CHARTE VISUELLE HARX :
          - Moderne, épuré, premium ; varie légèrement les layouts (split, minimal, highlight, gradient) pour le rythme visuel.
          - Garde une palette cohérente sur ce lot (accent rose #F43F5E et violet #6D28D9 ou tons dérivés du thème du programme).

          RÈGLES :
          0. SOURCES : respecte STRICTEMENT sourceMode (${sourceMode || 'default'}). 
             - uploads: n'utilise que les analyses upload comme fond principal.
             - kb: n'utilise que KB docs + call recordings.
             - uploads+kb: fusionne les deux, sans contradiction ; si conflit factuel, privilégie la KB.
             Si une sourceContext est fournie, elle prime sur tout contexte implicite.
             Si une source semble hors sujet métier, NE PAS l'utiliser.
          1. Chaque slide : "visualElements" avec 2–3 formes (rectangle, circle, line, arrow), coords 0–100 %, opacity 0.15–0.45 ; JSON compact.
          2. IMAGES DÉSACTIVÉES : ne génère PAS d'image. Mets "imageDescription" à "" et "illustrationUrl" à "".
          3. "note" : script oral 1–3 phrases pour le présentateur (ton naturel, comme Claude).
          4. Types : cover | agenda | content | quote | conclusion | quiz selon le rôle de la slide.

          FORMAT STRICT : un seul objet JSON {"slides":[ ... ]} — tableau dans l’ordre ci-dessus, sans texte hors JSON.

          Schéma d’un élément de "slides" :
          {
            "id": number,
            "type": "cover|agenda|content|quote|conclusion|quiz",
            "title": "string",
            "subtitle": "string",
            "content": "string (paragraphe) OU laisser plus léger si bullets portent le message",
            "bullets": ["string", "..."],
            "note": "script présentateur",
            "visualConfig": { "layout": "split|gradient|minimal|highlight", "theme": "dark|light", "backgroundHex": "#HEX", "textHex": "#HEX", "accentHex": "#HEX", "icon": "emoji" },
            "imageDescription": "",
            "illustrationUrl": "",
            "visualElements": [ { "type": "rectangle", "x": 5, "y": 10, "w": 30, "h": 4, "fill": "#F43F5E", "opacity": 0.25 } ]
          }`;
        
        try {
          const raw = await aiService.generateWithClaude(
            prompt,
            `${presentationSystemPrompt}\n\nLot : ${label} (MÉTHODE 360° HARX).`,
            apiKey,
            presentationMaxTokens,
            presentationClaudeOptions
          );
          const parsed = aiService.parseJson(raw, label);
          const slides = Array.isArray(parsed) ? parsed : parsed?.slides;
          return Array.isArray(slides) ? slides : [];
        } catch (e: any) {
          console.error(`❌ Batch generation failed for ${label}:`, e.message);
          return [];
        }
      };

      // ── LOT 1 : LES FONDATIONS (6 slides) ──────────────────────────────
      const batch1Desc = `
        Slide 1 : Slide de titre — accroche impactante, slogan fort, chiffre clé du domaine.
        Slide 2 : Contexte et problématique — statistiques, enjeux actuels, chiffres de référence.
        Slide 3 : Définition et concepts fondamentaux — clair, accessible, avec exemples concrets.
        Slide 4 : Historique et évolution — dates clés, timeline, faits marquants.
        Slide 5 : Fonctionnement détaillé — mécanismes, processus étape par étape.
        Slide 6 : Comparaisons et distinctions importantes — tableau ou points comparatifs.
      `;

      // ── LOT 2 : L'EXPERTISE 360° (5 slides) ─────────────────────────────
      const batch2Desc = `
        Slide 7 : Typologies et catégories (publiques, privées, professionnelles…).
        Slide 8 : Services et offres disponibles — liste complète avec exemples.
        Slide 9 : Avantages pour les bénéficiaires — bénéfices concrets, chiffres, témoignages.
        Slide 10 : Inconvénients et limites — regard critique et réaliste.
        Slide 11 : Cas pratique — exemple réel ou simulé avec chiffres concrets.
      `;

      // ── LOT 3a / 3b : ACTION & FUTUR (3+3 slides) — évite la troncature max_tokens ──
      const batch3aDesc = `
        Slide 12 : Rôle dans l'écosystème global — lien avec le système global et la société.
        Slide 13 : Contexte local/régional (Maroc ou pays cible) — données locales, spécificités.
        Slide 14 : Enjeux actuels et Innovations — IA, digitalisation, nouvelles technologies.
      `;
      const batch3bDesc = `
        Slide 15 : Conclusion synthétique — récapitulatif, messages clés, perspectives.
        Slide 16 : Prochaines étapes (Call to Action) — que faire après cette formation.
      `;

      const [slides1, slides2, slides3a, slides3b] = await Promise.all([
        generateBatch('B1 (Fondations)', batch1Desc, 1),
        generateBatch('B2 (Expertise)', batch2Desc, 7),
        generateBatch('B3a (Action 1/2)', batch3aDesc, 12),
        generateBatch('B3b (Action 2/2)', batch3bDesc, 15)
      ]);

      const merged = [...slides1, ...slides2, ...slides3a, ...slides3b];
      const withoutQuizSlides = merged.filter(
        (s: any) => String(s?.type || '').toLowerCase() !== 'quiz'
      );
      const allSlides = withoutQuizSlides.map((s, i) => ({
        ...s,
        _id: new mongoose.Types.ObjectId(),
        id: i + 1,
        imageDescription: '',
        illustrationUrl: '',
      }));

      return {
        title: program.title || 'Formation 360° HARX',
        visualTheme: program.visualTheme,
        totalSlides: allSlides.length,
        slides: allSlides,
        estimatedTime: `${allSlides.length * 2} minutes`
      };
    } catch (error) {
      console.error('❌ Méthode 360° Presentation generation error:', error);
      throw new AppError('Failed to generate 360° presentation', 500);
    }
  }

  async editSlide(slide: any, prompt: string, apiKey?: string): Promise<any> {
    try {
      console.log('✨ AI Slide Content/Style Modification via Prompt');
      
      const editPrompt = `Tu es un Expert en Design de Présentations et en Ingénierie Pédagogique chez HARX.
        
        MISSION : Modifier la slide suivante selon l'INSTRUCTION DE L'UTILISATEUR.
        
        SLIDE ACTUELLE :
        ${JSON.stringify(slide, null, 2)}
        
        INSTRUCTION DE L'UTILISATEUR :
        "${prompt}"
        
        CONSIGNES DE MODIFICATION :
        1. Tu peux TOUT modifier : le titre, le contenu, les puces (bullets), le style (visualConfig), les formes (visualElements), et les champs liés aux images.
        2. Le résultat doit rester strictement compatible avec la structure JSON d'origine (tu peux AJOUTER ou MODIFIER des champs, ne supprime pas les clés utiles sans raison).
        3. SI l'utilisateur demande un changement de style (ex: "plus moderne", "en mode sombre", "couleur bleue"), modifie 'visualConfig' en conséquence (backgroundHex, textHex, accentHex, layout, etc.).
        4. SI l'utilisateur demande des formes (rectangle, cercle, flèche, schéma…), mets à jour ou crée "visualElements" : types autorisés rectangle | rounded-rectangle | circle | ellipse | triangle | line | arrow ; x,y,w,h en pourcentages 0–100 sur la slide ; fill, stroke, strokeWidth, opacity, rotation, label optionnels.
        5. SI l'utilisateur demande une image ou illustration : enrichis "imageDescription" (prompt visuel détaillé). Si une URL réelle n'est pas disponible, laisse "illustrationUrl" vide ou absent ; ne fabrique pas d'URL fictive sauf demande explicite de placeholder.
        6. SI l'utilisateur demande un changement de contenu, assure-toi que la pédagogie reste de haute qualité.
        7. Réponds UNIQUEMENT avec l'objet JSON de la slide modifiée, sans texte avant ni après.
        
        RAPPEL Structure JSON :
        {
          "id": ${slide.id},
          "type": "${slide.type}",
          "title": "...",
          "subtitle": "...",
          "content": "...",
          "bullets": ["...", "..."],
          "note": "...",
          "visualConfig": {
            "layout": "split|gradient|minimal|highlight",
            "theme": "dark|light",
            "backgroundHex": "#HEX",
            "textHex": "#HEX",
            "accentHex": "#HEX",
            "icon": "lucide-icon-name"
          },
          "imageDescription": "...",
          "illustrationUrl": "",
          "visualElements": [
            { "type": "rectangle", "x": 0, "y": 70, "w": 100, "h": 30, "fill": "#1e293b", "opacity": 0.4 }
          ]
        }`;

      const editTemp = parseFloat(process.env.ANTHROPIC_PRESENTATION_TEMPERATURE || '0.5');
      const editModel = process.env.ANTHROPIC_PRESENTATION_MODEL?.trim();
      const raw = await aiService.generateWithClaude(
        editPrompt,
        'Tu es un expert HARX (qualité artefact Claude). Réponds uniquement en JSON valide pour la slide modifiée.',
        apiKey,
        8192,
        {
          temperature: editTemp,
          ...(editModel ? { preferredModels: [editModel] } : {}),
        }
      );
      const updatedSlide = aiService.parseJson(raw, `edit_slide_${slide.id}`);
      
      return { 
        ...slide, 
        ...updatedSlide, 
        id: slide.id // Ensure ID remains consistent
      };
    } catch (error: any) {
      console.error('❌ Slide edit failed:', error);
      throw new AppError(`Failed to edit slide: ${error.message || String(error)}`, 500);
    }
  }

  async synthesizeMultipleAnalyses(analyses: any[], apiKey?: string): Promise<any> {
    console.log(`🧠 Synthesizing ${analyses.length} document analyses into one unified journey...`);
    
    const synthesisPrompt = `Tu es un expert en synthèse pédagogique. 
      Tu as reçu ${analyses.length} analyses de documents différents.
      TA MISSION : Fusionner ces analyses en un SEUL contexte cohérent pour créer une formation unique.
      - Identifie les thèmes communs.
      - Résous les contradictions.
      - Crée une progression logique globale.

      ANALYSES :
      ${analyses.map((a, i) => `--- DOC ${i+1} ---\n${JSON.stringify(a.aiAnalysis || a)}`).join('\n\n')}

      Réponds en JSON valide uniquement (Format Synthèse) :
      {
        "unifiedTitle": "Titre global",
        "unifiedDescription": "Description qui englobe tout",
        "keyConcepts": ["Concept 1", "Concept 2"],
        "suggestedStructure": ["Introduction multi-sources", "Thème A", "Thème B", "Conclusion"],
        "learningPersonas": ["Persona 1", "Persona 2"]
      }`;

    const raw = await aiService.generateWithClaude(synthesisPrompt, "Return ONLY valid JSON synthesis.", apiKey);
    const synthesis = aiService.parseJson(raw, 'multi_doc_synthesis');

    // Return something compatible with 'analyzeDocument' output to reuse generation phases
    return {
      extractedContent: { text: "Synthèse Multi-Documents" },
      aiAnalysis: {
        ...synthesis,
        // Legacy keys for UI compatibility
        keyTopics: synthesis.keyConcepts || synthesis.suggestedStructure || [],
        difficulty: 5,
        estimatedReadTime: 30, // Default estimate for synthesis
        suggestedModules: synthesis.suggestedStructure || [],
        
        // Standard pedagogical fields
        keyConceptsExtracted: (synthesis.keyConcepts || []).map((c: string) => ({ concept: c, importance: 'high' })),
        pedagogicalAudit: {
          bloomsTaxonomyLevel: "Synthesis",
          learningPersonas: synthesis.learningPersonas || [],
          knowledgeGaps: []
        }
      }
    };
  }

  private cleanJsonResponse(raw: string): string {
    try {
      // Find the first { and last } to extract JSON even if AI adds conversational text
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end !== -1) {
        return raw.substring(start, end + 1);
      }
      return raw.replace(/```json\n?/, '').replace(/```\n?/, '').trim();
    } catch (e) {
      return raw.trim();
    }
  }
}

export default new DocumentAnalysisService();
