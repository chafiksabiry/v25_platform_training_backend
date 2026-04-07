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
  async analyzeDocument(filePath: string, fileType: string): Promise<DocumentAnalysisResult> {
    try {
      const text = await documentParserService.parseDocument(filePath, fileType);
      
      const analysisPrompt = `
        Analyze the following text extracted from a training document and provide a comprehensive training analysis.
        Text: ${text.substring(0, 15000)} // Limit text size for stability
        
        The output MUST be a JSON object that matches this structure:
        {
          "readabilityScore": 85,
          "keyConceptsExtracted": ["Concept A", "Concept B"],
          "suggestedLearningObjectives": ["Objective 1", "Objective 2"],
          "recommendedModuleStructure": ["Module 1", "Module 2"],
          "contentGaps": ["Gap 1"],
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
        
        Return ONLY the JSON object.
      `;

      const aiResponse = await aiService.generateWithClaude(
        analysisPrompt,
        "You are an expert training analyst. Return only valid JSON."
      );

      const aiAnalysisRaw = JSON.parse(this.cleanJsonResponse(aiResponse));
      
      // Ensure all required fields exist with defaults to prevent UI crashes
      const aiAnalysis = {
        readabilityScore: aiAnalysisRaw.readabilityScore || 0,
        keyConceptsExtracted: aiAnalysisRaw.keyConceptsExtracted || [],
        suggestedLearningObjectives: aiAnalysisRaw.suggestedLearningObjectives || [],
        recommendedModuleStructure: aiAnalysisRaw.recommendedModuleStructure || [],
        contentGaps: aiAnalysisRaw.contentGaps || [],
        engagementScore: aiAnalysisRaw.engagementScore || 0,
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
    } catch (error) {
      console.error('Document analysis error:', error);
      throw new AppError('Failed to analyze document', 500);
    }
  }

  async generateTrainingProgram(analysis: any): Promise<any> {
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

      const metaRaw = await aiService.generateWithClaude(metaPrompt, "Return ONLY valid JSON metadata.");
      const meta = aiService.parseJson(metaRaw, 'program_metadata');
      const modulePlan = meta.modules || [];

      if (modulePlan.length === 0) return meta;

      // ── Call 2: Detailed sessions for each module ─────────────────────────
      // We process all modules to ensure consistency
      const sessionPrompt = `Tu es un expert en conception pédagogique.
        Thème : ${meta.title}
        Durée : ${meta.duration}
        
        Pour chacun des modules suivants, génère les sessions détaillées et les sections de contenu.
        Réponds en JSON valide uniquement, sans markdown :
        {
          "modules": [
            {
              "id": 1,
              "title": "Titre exactement comme fourni",
              "duration": "Durée",
              "description": "Description détaillée",
              "learningObjectives": ["Obj 1", "Obj 2"],
              "sections": [
                {
                  "title": "Titre de la section",
                  "content": "Contenu pédagogique riche en Markdown (300+ mots)",
                  "type": "text|video|exercise",
                  "duration": 20
                }
              ],
              "quizzes": [
                {
                  "title": "Quiz de validation",
                  "questions": [
                    { "question": "Question?", "options": ["A", "B", "C"], "correctAnswer": 0, "explanation": "..." }
                  ]
                }
              ]
            }
          ]
        }

        Modules à détailler :
        ${modulePlan.map((m: any) => `- Module ${m.id}: ${m.title} (${m.duration}) — ${m.description}`).join('\n')}`;

      const sessionsRaw = await aiService.generateWithClaude(sessionPrompt, "Return ONLY valid JSON detailed modules.");
      const sessionsData = aiService.parseJson(sessionsRaw, 'program_sessions');

      const program = {
        ...meta,
        modules: sessionsData.modules || modulePlan
      };

      console.log('✅ Iterative Program Generation Complete');
      return program;
    } catch (error) {
      console.error('❌ Program generation error:', error);
      throw new AppError('Failed to generate high-quality program', 500);
    }
  }

  async generatePresentation(program: any): Promise<any> {
    try {
      console.log('🚀 Starting Multiphase Presentation Generation (3 batches)');
      const programInfo = `
        Titre : ${program.title || ''}
        Description : ${program.description || ''}
        Objectifs : ${(program.objectives || []).join(', ')}
        Modules : ${(program.modules || []).map((m: any) => m.title).join(', ')}
      `;

      const generateBatch = async (label: string, slideDescriptions: string, startId: number) => {
        const prompt = `Tu es un expert en création de présentations.
          PROGRAMME : ${programInfo}
          
          Génère UNIQUEMENT les slides suivantes :
          ${slideDescriptions}

          Réponds en JSON valide uniquement :
          {
            "slides": [
              {
                "id": ${startId},
                "type": "cover|agenda|content|exercise|quote|conclusion|quiz",
                "title": "Titre de la slide",
                "subtitle": "Sous-titre",
                "content": "Contenu détaillé (3 phrases min)",
                "bullets": ["point 1", "point 2", "point 3"],
                "note": "Note présentateur riche",
                "icon": "emoji",
                "highlight": "chiffre clé",
                "imageDescription": "Prompt pour image DALL-E"
              }
            ]
          }`;
        const raw = await aiService.generateWithClaude(prompt, `Return ONLY valid JSON for ${label}`);
        return aiService.parseJson(raw, label).slides || [];
      };

      const [slides1, slides2, slides3] = await Promise.all([
        generateBatch('batch 1 (1-6)', 'Slides 1-6: Titre, Agenda, Introduction, Concepts de base', 1),
        generateBatch('batch 2 (7-11)', 'Slides 7-11: Cas pratiques, Processus, Typologies', 7),
        generateBatch('batch 3 (12-17)', 'Slides 12-17: Innovation, Futur, Résumé, Quiz, Conclusion', 12)
      ]);

      const allSlides = [...slides1, ...slides2, ...slides3].map((s, i) => ({ ...s, id: i + 1 }));

      return {
        title: program.title || 'Présentation',
        totalSlides: allSlides.length,
        slides: allSlides
      };
    } catch (error) {
      console.error('❌ Presentation generation error:', error);
      throw new AppError('Failed to generate high-quality presentation', 500);
    }
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
