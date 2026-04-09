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
    options?: { gigId?: string; useKnowledgeBase?: boolean }
  ): Promise<any> {
    try {
      console.log('🚀 Starting Full-Claude MÉTHODE 360° Presentation Generation (17 slides, 3 batches)');

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

      const generateBatch = async (label: string, slideDescriptions: string, startId: number) => {
        const prompt = `Tu es le LEAD INSTRUCTIONAL DESIGNER chez HARX. Ta mission est de créer une présentation de classe mondiale en utilisant la MÉTHODE 360°.

          ${kbBlock}CONTEXTE DU PROGRAMME :
          ${programInfo}

          MISSION SPÉCIFIQUE :
          Génère UNIQUEMENT les slides suivantes avec une PROFONDEUR PÉDAGOGIQUE EXPERTE :
          ${slideDescriptions}

          CHARTE GRAPHIQUE HARX :
          - Style : Moderne, épuré, Premium, Corporate.
          - Chaque slide doit inclure des éléments visuels structurés (voir ci-dessous).

          RÈGLES D'OR :
          0. Si une BASE DE CONNAISSANCES est fournie plus haut, le contenu rédigé de chaque slide (titres, sous-titres, texte, puces, quiz) doit refléter ces documents. Si le titre du programme ci-dessus (ex. fiche job) ne correspond pas au domaine de la KB, fais primer la KB pour le fond : n'invente pas un autre métier ou secteur. Les exemples et notions viennent des documents.
          1. EXPERTISE : Contenu de niveau consultant, BASÉ SUR LE PROGRAMME ET LA KB SI PRÉSENTE.
          2. DESIGNER : Choisis le meilleur 'visualConfig' (split, minimal, highlight).
          3. VISUELS : Ajoute TOUJOURS "visualElements" : 2 à 6 formes géométriques par slide (rectangle, rounded-rectangle, circle, ellipse, triangle, line, arrow) pour cadres, accents, schémas simples ou flèches. Coordonnées en pourcentages de la slide (0–100) : x,y = position (coin haut-gauche ou centre pour circle), w,h = taille. Utilise fill/stroke en hex (#RRGGBB), opacity 0.15–0.5 pour les fonds décoratifs.
          4. ILLUSTRATIONS : Remplis "imageDescription" avec une description précise d’une image ou illustration conceptuelle (style, sujet, ambiance) — utile pour une génération d’image ultérieure. Ne mets "illustrationUrl" que si tu simules une URL de démo, sinon omets-le ou laisse vide.
          5. NOTES : Script court pour le présentateur.
          6. FORMAT : JSON valide uniquement.

          Structure JSON pour chaque slide :
          {
            "id": number,
            "type": "cover|agenda|content|quote|conclusion|quiz",
            "title": "Titre",
            "subtitle": "Sous-titre",
            "content": "Développement riche (3 phrases min)",
            "bullets": ["Point clé 1", "Point clé 2", "Point clé 3"],
            "note": "Note présentateur",
            "visualConfig": { "layout": "split|gradient|minimal|highlight", "theme": "dark|light", "backgroundHex": "#HEX", "textHex": "#HEX", "accentHex": "#HEX", "icon": "emoji" },
            "imageDescription": "Description détaillée pour une image / illustration (prompt visuel)",
            "illustrationUrl": "",
            "visualElements": [
              { "type": "rectangle", "x": 5, "y": 10, "w": 30, "h": 4, "fill": "#F43F5E", "opacity": 0.25 },
              { "type": "circle", "x": 80, "y": 15, "w": 12, "h": 12, "fill": "#6D28D9", "opacity": 0.3 },
              { "type": "arrow", "x": 20, "y": 50, "w": 25, "h": 0, "stroke": "#FFFFFF", "strokeWidth": 2, "opacity": 0.9 }
            ]
          }`;
        
        try {
          const raw = await aiService.generateWithClaude(prompt, `Génère le ${label} (MÉTHODE 360°).`, apiKey);
          const parsed = aiService.parseJson(raw, label);
          return parsed.slides || [];
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

      // ── LOT 3 : L'ACTION & FUTUR (6 slides) ─────────────────────────────
      const batch3Desc = `
        Slide 12 : Rôle dans l'écosystème global — lien avec le système global et la société.
        Slide 13 : Contexte local/régional (Maroc ou pays cible) — données locales, spécificités.
        Slide 14 : Enjeux actuels et Innovations — IA, digitalisation, nouvelles technologies.
        Slide 15 : Conclusion synthétique — récapitulatif, messages clés, perspectives.
        Slide 16 : Prochaines étapes (Call to Action) — que faire après cette formation.
        Slide 17 : Quiz interactif — 4 questions (3 options chacune) avec réponses et explications.
      `;

      const [slides1, slides2, slides3] = await Promise.all([
        generateBatch('B1 (Fondations)', batch1Desc, 1),
        generateBatch('B2 (Expertise)', batch2Desc, 7),
        generateBatch('B3 (Action/Futur)', batch3Desc, 12)
      ]);

      const allSlides = [...slides1, ...slides2, ...slides3].map((s, i) => ({ ...s, id: i + 1 }));

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

      const raw = await aiService.generateWithClaude(editPrompt, "Tu es un expert HARX. Réponds uniquement en JSON valide pour la slide modifiée.", apiKey);
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
