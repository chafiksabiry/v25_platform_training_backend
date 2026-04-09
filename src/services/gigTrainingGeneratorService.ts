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

      // ── Phase 2: Detailed sessions per module (parallel) ───────────────
      // One API call per module avoids max_tokens truncation on large programs.
      const modulePlan = meta.modules || [];

      const makeSessionPrompt = (m: any) => {
        const moduleHeader = [
          `ID: ${m.id}`,
          `Titre: ${m.title}`,
          `Durée (plan): ${m.duration ?? 'non précisée'}`,
          `Résumé (plan): ${m.description ?? ''}`
        ].join('\n');

        return `Tu es un expert pédagogique.
        Thème du programme : ${meta.title}
        ${kbPromptFragment}

        Pour le module décrit ci-dessous UNIQUEMENT, génère les sessions détaillées.
        TRÈS IMPORTANT : Inspire-toi DIRECTEMENT des détails techniques de la BASE DE CONNAISSANCES pour le contenu des sections.

        CONTRAINTES (obligatoires pour tenir dans la limite de tokens) :
        - Maximum 3 sections par module.
        - Maximum 150 mots par section (Markdown concis).
        - Un seul quiz avec exactement 3 questions à choix multiples.

        Réponds en JSON valide uniquement, sans markdown ni texte hors JSON. Racine : { "module": { ... } }.
        Le champ "module" doit inclure : id (nombre), title (string, le titre exact du module ci-dessous), duration (minutes, nombre),
        description, learningObjectives (tableau), sections (tableau d'objets avec title, content, type "text", duration, imageDescription),
        quizzes (tableau d'un objet avec title et questions : question, options (3 choix), correctAnswer (index 0-based), explanation),
        imageDescription (string).

        Module à détailler :
        ${moduleHeader}`;
      };

      const detailedModules = await Promise.all(
        modulePlan.map(async (m: any) => {
          try {
            const raw = await aiService.generateWithClaude(
              makeSessionPrompt(m),
              'Return ONLY valid JSON for this single module. No markdown fences, no commentary.',
              apiKey,
              8192
            );
            const parsed = aiService.parseJson(raw, `gig_session_module_${m.id}`);
            return parsed.module ?? m;
          } catch (e) {
            console.error(`⚠️ Gig session fallback for module ${m.id}:`, e);
            return m;
          }
        })
      );

      const sessionsData = { modules: detailedModules.length > 0 ? detailedModules : modulePlan };

      // ── Phase 3: Batched Presentation Generation ────────────────────────
      const generatePresentationBatch = async (batchLabel: string, slideDescriptions: string, startId: number) => {
        const prompt = `Tu es un expert en formation chez HARX. Génère UNIQUEMENT les slides suivantes pour la présentation "${meta.title}" en utilisant la MÉTHODE 360°.
          GIG : ${gig.title}
          ${kbPromptFragment}

          MISSION :
          Génère ces slides avec une précision technique maximale basée sur la BASE DE CONNAISSANCES :
          ${slideDescriptions}

          RÈGLES : 
          1. Les slides doivent être extrêmement techniques et précises.
          2. Extrais les chiffres, processus ou définitions des documents.
          3. Réponds en JSON valide uniquement.

          Structure JSON :
          {
            "slides": [
              {
                "id": number,
                "type": "cover|agenda|content|quote|conclusion|quiz",
                "title": "Titre",
                "content": "Développement détaillé (3 phrases min)",
                "bullets": ["Point A", "Point B"],
                "note": "Note présentateur riche",
                "icon": "emoji",
                "highlight": "chiffre clé"
              }
            ]
          }`;
        const raw = await aiService.generateWithClaude(prompt, `Return ONLY valid JSON for ${batchLabel} (Méthode 360°)`, apiKey);
        return aiService.parseJson(raw, batchLabel).slides || [];
      };

      const batch1Desc = `
        Slide 1: Titre et Accroche - Slogan fort lié au Job.
        Slide 2: Contexte du marché et enjeux actuels - Chiffres clés.
        Slide 3: Concepts fondamentaux et définitions - Base technique.
        Slide 4: Évolution du métier/secteur - Timeline ou faits marquants.
        Slide 5: Fonctionnement et Mécanismes - Processus métier.
        Slide 6: Différenciation et comparaison - Positionnement.
      `;

      const batch2Desc = `
        Slide 7: Typologies et segments clients/projets.
        Slide 8: Catalogue de services et offres (extraits des docs).
        Slide 9: Bénéfices et Valeur Ajoutée (ROI, efficacité).
        Slide 10: Défis et Limites du terrain - Réalisme.
        Slide 11: Étude de cas / Processus exemplaire - Détail technique.
      `;

      const batch3Desc = `
        Slide 12: Écosystème et partenaires - Relations métier.
        Slide 13: Spécificités locales et réglementaires (ex: Maroc).
        Slide 14: Futur et Innovations - IA, Digitalisation du poste.
        Slide 15: Synthèse des compétences clés.
        Slide 16: Call to Action - Prochaines étapes opérationnelles.
        Slide 17: Quiz de validation - 4 questions techniques MCQs.
      `;

      const [slides1, slides2, slides3] = await Promise.all([
        generatePresentationBatch('B1', batch1Desc, 1),
        generatePresentationBatch('B2', batch2Desc, 7),
        generatePresentationBatch('B3', batch3Desc, 12)
      ]);

      const allSlides = [...slides1, ...slides2, ...slides3].map((s, i) => ({ ...s, id: i + 1 }));

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
