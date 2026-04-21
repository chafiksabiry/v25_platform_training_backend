import mongoose from 'mongoose';
import Gig from '../models/Gig';
import Document from '../models/Document';
import TrainingJourney, { ITrainingJourney } from '../models/TrainingJourney';
import aiService from './aiService';
import { AppError } from '../middleware/errorHandler';

export type GenerateFromGigOptions = {
  /** When false, programme + présentation sont basés uniquement sur le Gig (titre, description…), sans documents KB. */
  useKnowledgeBase?: boolean;
  /** If true, recordings linked to gig should be considered in prompts when available. */
  includeCallRecordings?: boolean;
  /** Explicit source context from frontend (uploads/KB/call recordings). */
  sourceContext?: any;
};

class GigTrainingGeneratorService {
  private toMinutes(value: unknown, fallback = 60): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(1, Math.round(value));
    }
    if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      const num = parseFloat(lower.replace(',', '.'));
      if (!Number.isFinite(num)) return fallback;
      if (lower.includes('heure') || /\bh\b/.test(lower)) return Math.max(1, Math.round(num * 60));
      if (lower.includes('min')) return Math.max(1, Math.round(num));
      return Math.max(1, Math.round(num));
    }
    return fallback;
  }

  private normalizeModuleShape(moduleLike: any, index: number): any {
    const baseDuration = this.toMinutes(moduleLike?.duration, 60);
    const sections = Array.isArray(moduleLike?.sections)
      ? moduleLike.sections.map((section: any, sectionIndex: number) => ({
          ...section,
          title: String(section?.title || `Section ${sectionIndex + 1}`),
          content: String(section?.content || ''),
          type: String(section?.type || 'text'),
          duration: this.toMinutes(section?.duration, 20),
        }))
      : [];

    const quizzes = Array.isArray(moduleLike?.quizzes)
      ? moduleLike.quizzes.map((quiz: any) => ({
          ...quiz,
          duration: this.toMinutes(quiz?.duration, 10),
        }))
      : [];

    return {
      ...moduleLike,
      id: typeof moduleLike?.id === 'number' ? moduleLike.id : index + 1,
      title: String(moduleLike?.title || `Module ${index + 1}`),
      description: String(moduleLike?.description || ''),
      duration: baseDuration,
      sections,
      quizzes,
    };
  }

  private applyDurationConstraint(modules: any[], targetTotalMinutes?: number): any[] {
    if (!Array.isArray(modules) || modules.length === 0 || !targetTotalMinutes || targetTotalMinutes <= 0) {
      return modules;
    }

    const safeModules = modules.map((m, i) => this.normalizeModuleShape(m, i));
    const currentTotal = safeModules.reduce((sum, m) => sum + this.toMinutes(m?.duration, 60), 0);
    if (currentTotal <= 0) return safeModules;

    const ratio = targetTotalMinutes / currentTotal;
    return safeModules.map((m, idx) => {
      const base = this.toMinutes(m?.duration, 60);
      const scaled = Math.max(15, Math.round((base * ratio) / 5) * 5);
      return {
        ...m,
        id: typeof m?.id === 'number' ? m.id : idx + 1,
        duration: scaled
      };
    });
  }

  private computeSlideTargetFromModules(modules: any[]): number {
    const safeModules = Array.isArray(modules) ? modules : [];
    if (safeModules.length === 0) return 8;
    let sectionCount = 0;
    for (const module of safeModules) {
      sectionCount += Array.isArray(module?.sections) ? module.sections.length : 0;
    }
    const raw = 4 + safeModules.length + Math.ceil(sectionCount / 3);
    return Math.max(5, Math.min(8, raw));
  }

  private buildDynamicSlideItems(slideTarget: number, modules: any[]): string[] {
    const n = Math.max(1, slideTarget);
    const titles = (Array.isArray(modules) ? modules : []).map((m: any) => String(m?.title || 'Module').slice(0, 100));
    const plan: string[] = [];
    if (titles.length > 0) {
      for (let i = 0; i < n; i++) {
        const t = titles[i % titles.length];
        const phase = Math.floor(i / Math.max(1, titles.length)) % 3;
        if (phase === 0) plan.push(`${t} — points clés utiles au contexte du chat.`);
        else if (phase === 1) plan.push(`${t} — exemple opérationnel, décision ou cas terrain.`);
        else plan.push(`${t} — pièges fréquents et bonnes pratiques concrètes.`);
      }
    } else {
      for (let i = 0; i < n; i++) {
        plan.push('Contenu métier adapté au chat — définitions, exemples et application concrète.');
      }
    }
    return plan.map((desc, idx) => `Slide ${idx + 1}: ${desc}`);
  }

  async generateTrainingFromGig(
    gigId: string,
    apiKey?: string,
    options?: GenerateFromGigOptions
  ): Promise<ITrainingJourney> {
    const gig = await Gig.findById(gigId);
    if (!gig) {
      throw new AppError('Gig not found', 404);
    }

    const useKb = options?.useKnowledgeBase !== false;
    const includeCallRecordings = options?.includeCallRecordings === true;
    const sourceContext = options?.sourceContext && typeof options.sourceContext === 'object' ? options.sourceContext : null;

    console.log(
      `🚀 Starting ${useKb ? 'KB-Grounded' : 'Gig-only (no KB docs)'} Iterative Generation for Gig: ${gig.title}`
    );

    // ── Knowledge Base Retrieval ───────────────────────────────────────
    let kbContext = '';
    if (useKb) {
      try {
        const documents = await Document.find({ gigId }).sort({ createdAt: -1 });

        if (documents.length > 0) {
          console.log(`📚 Found ${documents.length} documents in KB for this Gig.`);
          kbContext = documents.map((doc, idx) => {
            const analysis = doc.analysis;
            const summary = analysis?.summary || '';
            const points = (analysis?.mainPoints || []).join('\n- ');
            const terms = (analysis?.keyTerms || []).join(', ');

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
    } else {
      console.log('⏭️ useKnowledgeBase=false — skipping KB document retrieval.');
    }

    const sourceMode = sourceContext?.sourceMode ? String(sourceContext.sourceMode) : '';
    const uploadAnalyses = Array.isArray(sourceContext?.uploadAnalyses) ? sourceContext.uploadAnalyses : [];
    const kbDocumentsFromContext = Array.isArray(sourceContext?.knowledgeDocuments) ? sourceContext.knowledgeDocuments : [];
    const callRecordingsFromContext = Array.isArray(sourceContext?.callRecordings) ? sourceContext.callRecordings : [];

    const gigSnapshotObj = sourceContext?.gigSnapshot && typeof sourceContext.gigSnapshot === 'object' ? sourceContext.gigSnapshot : null;
    const gigSnapshotBlock = gigSnapshotObj
      ? `GIG SNAPSHOT (titre, description, industries, activités, secteurs — ANCRAGE OBLIGATOIRE du plan et du contenu):\n${JSON.stringify(gigSnapshotObj).slice(0, 12000)}\n`
      : '';

    const explicitSourceContextBlock =
      sourceContext != null
        ? `\nSOURCE CONTEXT (explicit input)\n` +
          `sourceMode: ${sourceMode || 'unspecified'}\n` +
          gigSnapshotBlock +
          (uploadAnalyses.length
            ? `UPLOAD ANALYSES:\n${uploadAnalyses
                .map((u: any, i: number) => `[UPLOAD ${i + 1}] ${u?.fileName || 'Untitled'} | topics: ${(u?.keyTopics || []).join(', ')}`)
                .join('\n')}\n`
            : '') +
          (kbDocumentsFromContext.length
            ? `KB DOCUMENTS:\n${kbDocumentsFromContext
                .map((d: any, i: number) => `[KB ${i + 1}] ${d?.name || 'Untitled'} | summary: ${d?.summary || ''}`)
                .join('\n')}\n`
            : '') +
          (callRecordingsFromContext.length
            ? `CALL RECORDINGS:\n${callRecordingsFromContext
                .map((c: any, i: number) => `[CALL ${i + 1}] summary: ${c?.summaryText || ''} | keyIdeas: ${(c?.keyIdeas || []).map((k: any) => k?.title || '').join(', ')}`)
                .join('\n')}\n`
            : '')
        : '';

    const preferences = sourceContext?.preferences && typeof sourceContext.preferences === 'object'
      ? sourceContext.preferences
      : null;
    const preferredDurationRaw = preferences?.selectedDuration;
    const preferredTotalMinutes = this.toMinutes(preferredDurationRaw, 0);
    const preferencesBlock = preferences
      ? `\nPREFERENCES UTILISATEUR (OBLIGATOIRE):\n` +
        `- Duree cible: ${preferences?.selectedDuration || 'non specifiee'}\n` +
        `- Methodologie choisie: ${preferences?.methodologyName || 'non specifiee'}\n` +
        `- Description methodologie: ${preferences?.methodologyDescription || 'non specifiee'}\n` +
        `- Composants methodologie: ${(preferences?.methodologyComponents || []).join(', ') || 'non specifies'}\n` +
        `IMPORTANT: Respecte strictement cette duree cible et cette methodologie dans la structure du plan.\n` +
        `IMPORTANT: La duree doit venir UNIQUEMENT de la duree cible utilisateur (pas des durees de composants de methodologie).\n`
      : '';

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
        ${explicitSourceContextBlock}
        ${preferencesBlock}
        ${includeCallRecordings ? '\nIMPORTANT: si des call recordings sont fournis dans SOURCE CONTEXT, utilise-les pour enrichir objections, ton, scénarios et exemples concrets.\n' : ''}

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
      const modulePlanRaw = Array.isArray(meta.modules) ? meta.modules : [];
      const modulePlan = modulePlanRaw.map((m: any, i: number) => this.normalizeModuleShape(m, i));

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
        ${explicitSourceContextBlock}
        ${preferencesBlock}

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
            return this.normalizeModuleShape(parsed.module ?? m, Number(m?.id ?? 0) - 1 >= 0 ? Number(m.id) - 1 : 0);
          } catch (e) {
            console.error(`⚠️ Gig session fallback for module ${m.id}:`, e);
            return this.normalizeModuleShape(m, Number(m?.id ?? 0) - 1 >= 0 ? Number(m.id) - 1 : 0);
          }
        })
      );

      const normalizedModules = (detailedModules.length > 0 ? detailedModules : modulePlan).map((m: any, i: number) =>
        this.normalizeModuleShape(m, i)
      );
      const constrainedModules = this.applyDurationConstraint(normalizedModules, preferredTotalMinutes);
      const sessionsData = {
        modules: constrainedModules,
      };

      // ── Phase 3: Batched Presentation Generation ────────────────────────
      const generatePresentationBatch = async (batchLabel: string, slideDescriptions: string, startId: number) => {
        const prompt = `Tu es un expert en formation chez HARX. Génère UNIQUEMENT les slides suivantes pour la présentation "${meta.title}" en utilisant la MÉTHODE 360°.
          GIG : ${gig.title}
          ${kbPromptFragment}
          ${explicitSourceContextBlock}

          MISSION :
          Génère ces slides avec une précision technique maximale basée sur la BASE DE CONNAISSANCES :
          ${slideDescriptions}

          RÈGLES :
          1. Les slides doivent être extrêmement techniques et précises.
          2. Extrais les chiffres, processus ou définitions des documents.
          3. Chaque slide doit inclure "visualElements" (2 à 6 formes : rectangle, rounded-rectangle, circle, ellipse, triangle, line, arrow) avec x,y,w,h en % (0–100), fill/stroke en hex, opacity pour les fonds décoratifs.
          4. IMAGES DÉSACTIVÉES : ne génère PAS d'image. Mets "imageDescription" à "" et "illustrationUrl" à "".
          5. Inclus "visualConfig" : layout, theme, backgroundHex, textHex, accentHex quand pertinent.
          6. Vise un total d'environ 8 slides (maximum 8) pour l'ensemble de la présentation.
          7. Ne force pas de structure (pas d'obligation cover/sommaire/conclusion). Laisse la progression s'adapter spontanément au contenu du chat et des modules.
          8. Pas besoin de styliser le plan de narration : va droit au contenu utile.
          9. Réponds en JSON valide uniquement.

          Structure JSON :
          {
            "slides": [
              {
                "id": number,
                "type": "content|quote|exercise|scenario|data|recap|quiz",
                "title": "Titre",
                "subtitle": "optionnel",
                "content": "Développement détaillé (3 phrases min)",
                "bullets": ["Point A", "Point B"],
                "note": "Note présentateur riche",
                "icon": "emoji",
                "highlight": "chiffre clé",
                "visualConfig": { "layout": "split|gradient|minimal|highlight", "theme": "dark|light", "backgroundHex": "#HEX", "textHex": "#HEX", "accentHex": "#HEX" },
                "imageDescription": "",
                "illustrationUrl": "",
                "visualElements": [
                  { "type": "circle", "x": 75, "y": 10, "w": 15, "h": 15, "fill": "#F43F5E", "opacity": 0.25 }
                ]
              }
            ]
          }`;
        try {
          const raw = await aiService.generateWithClaude(
            prompt,
            `Return ONLY valid JSON for ${batchLabel} (Méthode 360°)`,
            apiKey
          );
          const parsed = aiService.parseJson(raw, batchLabel);
          const slides = parsed?.slides;
          return Array.isArray(slides) ? slides : [];
        } catch (error: any) {
          console.error(`⚠️ Presentation batch fallback for ${batchLabel}:`, error?.message || error);
          return [];
        }
      };

      const slideTarget = this.computeSlideTargetFromModules(constrainedModules);
      const lineItems = this.buildDynamicSlideItems(slideTarget, constrainedModules);
      const batchCount = Math.min(4, Math.max(1, lineItems.length));
      const chunkSize = Math.ceil(lineItems.length / batchCount);
      const batches: Array<{ label: string; startId: number; desc: string }> = [];
      for (let i = 0; i < batchCount; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, lineItems.length);
        const chunk = lineItems.slice(start, end);
        if (chunk.length === 0) continue;
        batches.push({
          label: `B${i + 1}`,
          startId: start + 1,
          desc: chunk.join('\n'),
        });
      }

      const batchSlides = await Promise.all(
        batches.map((b) => generatePresentationBatch(`${b.label}`, b.desc, b.startId))
      );

      const mergedSlides = batchSlides.flat().filter(
        (s: any) => String(s?.type || '').toLowerCase() !== 'quiz'
      );
      const allSlides = mergedSlides.map((s, i) => ({
        ...s,
        _id: new mongoose.Types.ObjectId(),
        id: i + 1,
        imageDescription: '',
        illustrationUrl: '',
      }));

      // ── Final Assembly & Persistence ────────────────────────────────────
      const journeyData: Partial<ITrainingJourney> = {
        ...meta,
        modules: sessionsData.modules || [],
        companyId: gig.companyId,
        gigId: gig._id,
        industry: gig.industry,
        estimatedDuration: preferredTotalMinutes > 0
          ? `${Math.round(preferredTotalMinutes / 60)} heures`
          : (meta.estimatedDuration || meta.duration),
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
