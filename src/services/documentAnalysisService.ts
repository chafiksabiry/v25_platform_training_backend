import documentParserService from './documentParserService';
import aiService from './aiService';
import { AppError } from '../middleware/errorHandler';

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

        Le résultat DOIT être un objet JSON valide avec cette structure exacte, et chaque tableau DOIT être limité à MAXIMUM 5 à 7 éléments les plus importants :
        {
          "readabilityScore": 85,
          "keyConceptsExtracted": ["Concept A", "Concept B"], // Limité à 7 max
          "suggestedLearningObjectives": ["Objectif 1", "Objectif 2"], // Limité à 5 max
          "recommendedModuleStructure": ["Module 1", "Module 2"], // Limité à 7 max
          "contentGaps": ["Manque 1"], // Limité à 4 max
          "engagementScore": 75,
          "improvementSuggestions": [ // Limité à 3 max
            {
              "type": "media",
              "priority": "high",
              "suggestion": "...",
              "implementation": "...",
              "expectedImpact": "..."
            }
          ],
          "mediaRecommendations": [ // Limité à 4 max
            {
              "type": "video",
              "purpose": "...",
              "description": "...",
              "priority": 8
            }
          ]
        }
        
        CRITIQUE : Sois très concis. Ne génère pas de longues listes.
        Réponds UNIQUEMENT avec l'objet JSON valide sans texte avant ni après.
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
          ]
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
        
        Réponds en JSON valide uniquement, avec cette structure exacte, sans texte avant ou après :
        {
          "module": {
            "id": ${m.id},
            "title": "${m.title}",
            "duration": "${m.duration}",
            "description": "Description détaillée courte",
            "learningObjectives": ["Obj 1", "Obj 2"], // Max 3
            "sections": [ // MAX 2 sections !!!
              {
                "title": "Titre explicite",
                "content": "Contenu pédagogique concis en Markdown (100-150 mots max)",
                "type": "text",
                "duration": 20
              }
            ],
            "quizzes": [ // MAX 1 quiz de 3 questions !!!
              {
                "title": "Validation des acquis",
                "questions": [
                  { "question": "Q?", "options": ["A", "B", "C"], "correctAnswer": 0, "explanation": "..." }
                ]
              }
            ]
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

  async generatePresentation(program: any, apiKey?: string): Promise<any> {
    try {
      console.log('🚀 Starting Full-Claude High-Quality Presentation Generation (3 batches)');
      const programInfo = `
        PROGRAMME : ${program.title || ''}
        OBJECTIFS : ${(program.objectives || []).join(', ')}
        STRUCTURE : ${(program.modules || []).map((m: any) => `${m.id}: ${m.title}`).join(' | ')}
        CONTENU DÉTAILLÉ : ${JSON.stringify(program.modules || []).slice(0, 8000)}
      `;

      const generateBatch = async (label: string, slideDescriptions: string, startId: number) => {
        const prompt = `Tu es le LEAD INSTRUCTIONAL DESIGNER chez HARX. Ta mission est de créer une présentation de classe mondiale.
          
          CONTEXTE DU PROGRAMME :
          ${programInfo}

          MISSION SPÉCIFIQUE :
          Génère les slides suivantes avec une PROFONDEUR PÉDAGOGIQUE EXPERTE et un DESIGN VISUEL STRATÉGIQUE :
          ${slideDescriptions}

          CHARTE GRAPHIQUE HARX (À RESPECTER) :
          - Couleurs : Rose (#F43F5E), Violet (#6D28D9), Anthracite (#111827).
          - Style : Moderne, épuré, Glassmorphism, Premium.

          RÈGLES D'OR DE QUALITÉ :
          1. EXPERTISE : Contenu de niveau consultant senior.
          2. DESIGNER : Pour CHAQUE slide, choisis le meilleur 'visualConfig' pour l'impact visuel.
          3. NOTES : Script pro incluant des conseils de posture et d'animation.
          4. FORMAT : JSON valide uniquement.

          Structure JSON avec Design :
          {
            "slides": [
              {
                "id": ${startId},
                "type": "cover|agenda|module|content|exercise|quote|conclusion|quiz",
                "title": "Titre",
                "subtitle": "Sous-titre",
                "content": "Texte riche",
                "bullets": ["Point 1", "Point 2"],
                "note": "Notes présentateur détaillées",
                "visualConfig": {
                  "layout": "split|gradient|minimal|highlight",
                  "theme": "dark|light",
                  "accent": "rose|purple|gold",
                  "icon": "lucide-icon-name"
                },
                "imageDescription": "Description visuelle pour DALL-E"
              }
            ]
          }`;
        
        const raw = await aiService.generateWithClaude(prompt, `Tu es un expert HARX. Génère le ${label} de la présentation.`, apiKey);
        return aiService.parseJson(raw, label).slides || [];
      };

      // 5 Specialized Batches to avoid token truncation while maintaining elite quality
      const [batch1, batch2, batch3, batch4, batch5] = await Promise.all([
        generateBatch('LOT 1 (Ouverture)', 'Slide 1: Cover, Slide 2: Agenda, Slide 3: Vision & Enjeux.', 1),
        generateBatch('LOT 2 (Fondations)', 'Slides 4-6: Concepts fondamentaux, théorie et piliers stratégiques.', 4),
        generateBatch('LOT 3 (Méthodologie)', 'Slides 7-9: Cœur de la solution, processus détaillé et insights experts.', 7),
        generateBatch('LOT 4 (Pratique)', 'Slides 10-12: Cas pratiques, Scénarios réels et Ateliers interactifs.', 10),
        generateBatch('LOT 5 (Clôture)', 'Slides 13-15: Quiz de validation, Prochaines étapes et Conclusion Impactante.', 13)
      ]);

      const allSlides = [...batch1, ...batch2, ...batch3, ...batch4, ...batch5].map((s, i) => ({ ...s, id: i + 1 }));

      return {
        title: program.title || 'Présentation Elite HARX',
        totalSlides: allSlides.length,
        slides: allSlides,
        estimatedTime: `${allSlides.length * 3} minutes`
      };
    } catch (error) {
      console.error('❌ Full-Claude Presentation generation error:', error);
      throw new AppError('Failed to generate elite presentation with Claude', 500);
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
