import Gig from '../models/Gig';
import Document from '../models/Document';
import TrainingJourney, { ITrainingJourney } from '../models/TrainingJourney';
import aiService from './aiService';
import { AppError } from '../middleware/errorHandler';

class GigTrainingGeneratorService {
  async generateTrainingFromGig(gigId: string, apiKey?: string): Promise<ITrainingJourney> {
    const gig = await Gig.findById(gigId);
    if (!gig) {
      throw new AppError('Gig not found', 404);
    }

    console.log(`🚀 Starting KB-Grounded Iterative Generation for Gig: ${gig.title}`);

    // ── Knowledge Base Retrieval ───────────────────────────────────────
    let kbContext = '';
    try {
      // Fetch documents linked to this Gig
      const documents = await Document.find({ gigId }).sort({ createdAt: -1 });
      
      if (documents.length > 0) {
        console.log(`📚 Found ${documents.length} documents in KB for this Gig.`);
        kbContext = documents.map((doc, idx) => {
          const analysis = doc.analysis;
          const summary = analysis?.summary || '';
          const points = (analysis?.mainPoints || []).join('\n- ');
          const terms = (analysis?.keyTerms || []).join(', ');
          
          // Use AI analysis if available, otherwise fallback to start of content
          const technicalBase = summary || doc.content?.slice(0, 3000) || '';
          
          return `[DOCUMENT ${idx + 1}: ${doc.name}]\n` +
                 `SYNTHÈSE : ${technicalBase}\n` +
                 (points ? `POINTS CLÉS :\n- ${points}\n` : '') +
                 (terms ? `MOTS CLÉS : ${terms}\n` : '');
        }).join('\n---\n');
      } else {
        console.log('⚠️ No specific documents found for this Gig. Using only Gig description.');
      }
    } catch (err) {
      console.error('❌ Failed to fetch documents for KB grounding:', err);
    }

    const kbPromptFragment = kbContext 
      ? `\nBASE DE CONNAISSANCES (SOURCE DE VÉRITÉ) :\n${kbContext}\n` 
      : '';

    try {
      // ── Phase 1: Program Metadata & Module Plan ─────────────────────────
      const metaPrompt = `Tu es un expert en conception pédagogique chez HARX. 
        Génère un programme de formation professionnel de haute qualité basé sur le Gig suivant ${kbContext ? 'ET sur la Base de Connaissances fournie' : ''}.
        
        TITRE DU JOB : ${gig.title}
        DESCRIPTION : ${gig.description}
        INDUSTRIE : ${gig.industry}
        ${kbPromptFragment}

        MISSION : Crée une structure pédagogique basée sur la Taxonomie de Bloom.
        IMPORTANT : Utilise les termes techniques et les concepts spécifiques trouvés dans la BASE DE CONNAISSANCES.

        Réponds en JSON valide uniquement :
        {
          "name": "Titre du programme",
          "title": "Titre accrocheur",
          "description": "Description détaillée",
          "estimatedDuration": "X heures",
          "targetRoles": ["Rôle 1", "Rôle 2"],
          "objectives": ["Obj 1", "Obj 2"],
          "modules": [
            { "id": 1, "title": "Module 1", "duration": "1h", "description": "..." },
            { "id": 2, "title": "Module 2", "duration": "1h", "description": "..." }
          ],
          "visualTheme": {
            "primaryColor": "#HEX",
            "secondaryColor": "#HEX",
            "accentColor": "#HEX",
            "fontFamily": "font-name",
            "layoutStyle": "modern|corporate|creative"
          }
        }`;

      const metaRaw = await aiService.generateWithClaude(metaPrompt, "Return ONLY valid JSON metadata metadata.", apiKey);
      const meta = aiService.parseJson(metaRaw, 'gig_metadata');

      // ── Phase 2: Detailed Sessions for Each Module ──────────────────────
      const modulePlan = meta.modules || [];
      const sessionPrompt = `Tu es un expert pédagogique.
        Thème : ${meta.title}
        ${kbPromptFragment}
        
        Pour chacun des modules suivants, génère les sessions détaillées.
        TRÈS IMPORTANT : Inspire-toi DIRECTEMENT des détails techniques de la BASE DE CONNAISSANCES pour le contenu des sections.
        
        Réponds en JSON valide uniquement :
        {
          "modules": [
            {
              "id": 1,
              "title": "Titre",
              "duration": 60,
              "description": "Description",
              "learningObjectives": ["Obj 1"],
              "sections": [
                { "title": "Section 1", "content": "Contenu riche en Markdown (300+ mots) basé sur les documents", "type": "text", "duration": 20, "imageDescription": "Description visuelle" }
              ],
              "quizzes": [
                { "title": "Quiz", "questions": [ { "question": "?", "options": ["A", "B"], "correctAnswer": 0, "explanation": "..." } ] }
              ],
              "imageDescription": "Description visuelle"
            }
          ]
        }

        Modules :
        ${modulePlan.map((m: any) => `- ${m.id}: ${m.title}`).join('\n')}`;

      const sessionsRaw = await aiService.generateWithClaude(sessionPrompt, "Return ONLY valid JSON detailed modules.", apiKey);
      const sessionsData = aiService.parseJson(sessionsRaw, 'gig_sessions');

      // ── Phase 3: Batched Presentation Generation ────────────────────────
      const generatePresentationBatch = async (batchLabel: string, slideCount: string, startId: number) => {
        const prompt = `Génère ${slideCount} slides pour la présentation "${meta.title}".
          GIG : ${gig.title}
          ${kbPromptFragment}

          RÈGLES : 
          1. Les slides doivent être extrêmement techniques et précises, basées sur la BASE DE CONNAISSANCES.
          2. Ne sois pas superficiel. Extrais les chiffres, processus ou définitions des documents.

          Réponds en JSON valide uniquement :
          {
            "slides": [
              {
                "id": ${startId},
                "type": "cover|content|exercise|quote|conclusion",
                "title": "Titre",
                "content": "Développement détaillé (3 phrases min)",
                "bullets": ["Point A", "Point B"],
                "note": "Note présentateur riche exploitant les documents",
                "icon": "emoji",
                "highlight": "chiffre clé"
              }
            ]
          }`;
        const raw = await aiService.generateWithClaude(prompt, `Return ONLY valid JSON for ${batchLabel}`, apiKey);
        return aiService.parseJson(raw, batchLabel).slides || [];
      };

      const [batch1, batch2, batch3] = await Promise.all([
        generatePresentationBatch('B1', 'Slides 1-6', 1),
        generatePresentationBatch('B2', 'Slides 7-12', 7),
        generatePresentationBatch('B3', 'Slides 13-17+', 13)
      ]);

      const allSlides = [...batch1, ...batch2, ...batch3].map((s, i) => ({ ...s, id: i + 1 }));

      // ── Final Assembly & Persistence ────────────────────────────────────
      const journeyData: Partial<ITrainingJourney> = {
        ...meta,
        modules: sessionsData.modules || [],
        companyId: gig.companyId,
        gigId: gig._id,
        industry: gig.industry,
        status: 'draft',
        methodologyData: {
          presentation: allSlides,
          generatedAt: new Date()
        }
      };

      const journey = await TrainingJourney.create(journeyData);
      console.log('✅ Iterative Gig Generation Complete');
      return journey;
    } catch (error) {
      console.error('❌ Gig generation error:', error);
      throw new AppError('Failed to generate high-quality training from Gig', 500);
    }
  }
}

export default new GigTrainingGeneratorService();
