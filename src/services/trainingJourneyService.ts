import mongoose from 'mongoose';
import TrainingJourney, { ITrainingJourney } from '../models/TrainingJourney';
import RepProgress from '../models/RepProgress';
import RepTrainingTracking, {
  REP_TRAINING_TRACKING_EVENTS,
  RepTrainingTrackingEventKind
} from '../models/RepTrainingTracking';
import Rep from '../models/Rep';
import { AppError } from '../middleware/errorHandler';
import { ImageGenerationService } from './imageGenerationService';

function requireObjectId(raw: unknown, label: string): mongoose.Types.ObjectId {
  const s = String(raw ?? '').trim();
  if (!mongoose.Types.ObjectId.isValid(s)) {
    throw new AppError(`Invalid ${label} (expected a Mongo ObjectId)`, 400);
  }
  return new mongoose.Types.ObjectId(s);
}

function countSlidesOnJourney(j: { presentation?: { slides?: unknown } } | null | undefined): number {
  const slides = j?.presentation?.slides;
  return Array.isArray(slides) ? slides.length : 0;
}

/** Assigne un _id Mongo à chaque slide qui n’en a pas (présentation persistée). */
export function ensurePresentationSlideIdsOnSlides(slides: unknown[] | null | undefined): boolean {
  if (!Array.isArray(slides)) return false;
  let changed = false;
  for (const slide of slides) {
    if (!slide || typeof slide !== 'object') continue;
    const s = slide as { _id?: unknown; slideId?: unknown };
    const raw = s._id ?? s.slideId;
    const ok = raw != null && mongoose.Types.ObjectId.isValid(String(raw));
    if (!ok) {
      (slide as { _id: mongoose.Types.ObjectId })._id = new mongoose.Types.ObjectId();
      changed = true;
    }
  }
  return changed;
}

function countCompletedInTrackingSlides(track: Record<string, unknown> | null | undefined): number {
  const raw = track?.slides as unknown;
  if (!raw || typeof raw !== 'object') return 0;
  if (raw instanceof Map) {
    let n = 0;
    for (const v of raw.values()) {
      if (v && typeof v === 'object' && (v as { completed?: boolean }).completed === true) n += 1;
    }
    return n;
  }
  return Object.values(raw as Record<string, { completed?: boolean }>).filter((v) => v?.completed === true)
    .length;
}

function normalizeSlideIdForTracking(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'object' && raw !== null && '$oid' in raw) {
    const s = String((raw as { $oid: string }).$oid).trim();
    return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s).toString() : '';
  }
  const s = String(raw).trim();
  return mongoose.Types.ObjectId.isValid(s) ? new mongoose.Types.ObjectId(s).toString() : '';
}

function getSlideStateFromTrackingMap(
  rawSlides: unknown,
  slideIdHex: string
): { completed?: boolean } | undefined {
  if (!slideIdHex || !rawSlides || typeof rawSlides !== 'object') return undefined;
  if (rawSlides instanceof Map) {
    return rawSlides.get(slideIdHex) as { completed?: boolean } | undefined;
  }
  return (rawSlides as Record<string, { completed?: boolean }>)[slideIdHex];
}

function trackingSlidesMapHasEntries(rawSlides: unknown): boolean {
  if (!rawSlides || typeof rawSlides !== 'object') return false;
  if (rawSlides instanceof Map) return rawSlides.size > 0;
  return Object.keys(rawSlides as object).length > 0;
}

/**
 * Index 0-based de la slide à afficher au « Continue » : première slide non complétée,
 * ou dernière slide si tout est complété ; sinon repli slideIndex legacy / engagementScore.
 */
function resolveCurrentSlideIndex(
  doc: { presentation?: { slides?: unknown } } | null | undefined,
  tr: Record<string, unknown> | null | undefined,
  pr: { engagementScore?: number } | null | undefined,
  slidesTotal: number
): number {
  if (slidesTotal <= 0) return 0;
  const lastIdx = slidesTotal - 1;

  if (tr && typeof tr.slideIndex === 'number' && Number.isFinite(tr.slideIndex)) {
    const si = Math.floor(tr.slideIndex);
    return Math.min(lastIdx, Math.max(0, si));
  }

  const slides = doc?.presentation?.slides;
  if (Array.isArray(slides) && slides.length > 0 && tr && trackingSlidesMapHasEntries(tr.slides)) {
    const rawMap = tr.slides as unknown;
    for (let i = 0; i < slides.length; i++) {
      const sid = normalizeSlideIdForTracking((slides[i] as { _id?: unknown })?._id);
      const state = sid ? getSlideStateFromTrackingMap(rawMap, sid) : undefined;
      if (!state || state.completed !== true) {
        return Math.min(lastIdx, i);
      }
    }
    return lastIdx;
  }

  if (pr && typeof pr.engagementScore === 'number' && Number.isFinite(pr.engagementScore)) {
    const eng = Math.max(0, Math.min(100, Math.round(pr.engagementScore)));
    const approx = Math.round((eng / 100) * slidesTotal);
    return Math.min(lastIdx, Math.max(0, approx - 1));
  }

  return 0;
}

export type RepSlideProgressJourneyLine = {
  journeyId: string;
  journeyTitle: string;
  slidesSeen: number;
  slidesTotal: number;
  /** slidesSeen / slidesTotal (0 si pas de slides) */
  ratio: number;
  /** Index 0-based dans `presentation.slides` pour reprendre le parcours */
  currentSlideIndex: number;
};

export type RepSlideProgressSummary = {
  /** Nombre de formations prises en compte (union tracking + rep_progress) */
  trainingCount: number;
  journeys: RepSlideProgressJourneyLine[];
  /** Somme des ratios : ex. 3/15 + 2/7 */
  sumOfRatios: number;
  /** Moyenne arithmétique des ratios (score entre 0 et 1) */
  averageRatio: number;
  /** Math.round(averageRatio * 100), plafonné à 100 */
  overallPercent: number;
  /** Texte explicite pour l’UI */
  formulaHuman: string;
};

class TrainingJourneyService {
  private resolveTrainingLogo(journey: any): { type: 'icon' | 'image'; value: string } {
    const explicitType = String(journey?.trainingLogo?.type || '').trim().toLowerCase();
    const explicitValue = String(journey?.trainingLogo?.value || '').trim();
    if ((explicitType === 'icon' || explicitType === 'image') && explicitValue) {
      return { type: explicitType as 'icon' | 'image', value: explicitValue };
    }

    const seed = `${journey?.title || ''} ${journey?.name || ''} ${journey?.description || ''}`.toLowerCase();
    if (/\b(securit|kyc|compliance|conformit|risk)\b/.test(seed)) {
      return { type: 'icon', value: 'shield' };
    }
    if (/\b(vente|sales|negociation|closing|prospection|crm)\b/.test(seed)) {
      return { type: 'icon', value: 'briefcase' };
    }
    if (/\b(report|data|analytics|kpi|tableau|dashboard)\b/.test(seed)) {
      return { type: 'icon', value: 'chart' };
    }
    if (/\b(ai|ia|tech|digital|code|developpement|devops|cloud)\b/.test(seed)) {
      return { type: 'icon', value: 'laptop' };
    }
    return { type: 'icon', value: 'book-open' };
  }

  private ensureObjectIds(journey: any): void {
    if (!journey.modules) return;

    journey.modules.forEach((module: any) => {
      if (!module._id || !mongoose.Types.ObjectId.isValid(module._id)) {
        module._id = new mongoose.Types.ObjectId().toString();
      }

      if (module.sections) {
        module.sections.forEach((section: any) => {
          if (!section._id || !mongoose.Types.ObjectId.isValid(section._id)) {
            section._id = new mongoose.Types.ObjectId().toString();
          }
        });
      }

      if (module.quizzes) {
        module.quizzes.forEach((quiz: any) => {
          if (!quiz._id || !mongoose.Types.ObjectId.isValid(quiz._id)) {
            quiz._id = new mongoose.Types.ObjectId().toString();
          }

          if (quiz.questions) {
            quiz.questions.forEach((question: any) => {
              if (!question._id || !mongoose.Types.ObjectId.isValid(question._id)) {
                question._id = new mongoose.Types.ObjectId().toString();
              }
            });
          }
        });
      }
    });

    if (journey.finalExam) {
      if (!journey.finalExam._id || !mongoose.Types.ObjectId.isValid(journey.finalExam._id)) {
        journey.finalExam._id = new mongoose.Types.ObjectId().toString();
      }

      if (journey.finalExam.questions) {
        journey.finalExam.questions.forEach((question: any) => {
          if (!question._id || !mongoose.Types.ObjectId.isValid(question._id)) {
            question._id = new mongoose.Types.ObjectId().toString();
          }
        });
      }
    }

    // New: Ensure relational IDs are valid ObjectIds if they look like ones
    // This helps Mongoose cast them correctly
    ['companyId', 'gigId', 'industry'].forEach(field => {
      if (journey[field] && typeof journey[field] === 'string' && mongoose.Types.ObjectId.isValid(journey[field])) {
        // Mongoose will handle the actual casting, but we ensure it's a valid hex string
      }
    });
  }

  private async populateImages(journey: any): Promise<void> {
    const pres = journey.presentation;
    if (pres?.slides && Array.isArray(pres.slides)) {
      for (let i = 0; i < pres.slides.length; i++) {
        const slide = pres.slides[i];
        const desc = slide?.imageDescription;
        const hasUrl = slide?.illustrationUrl && String(slide.illustrationUrl).trim().length > 0;
        if (typeof desc === 'string' && desc.trim().length > 0 && !hasUrl) {
          try {
            slide.illustrationUrl = await ImageGenerationService.generateImage(desc);
          } catch (error) {
            console.error(`[TrainingJourneyService] Failed slide illustration ${i + 1}:`, error);
          }
        }
      }
    }

    if (!journey.modules) return;

    for (const module of journey.modules) {
      // Generate module image if description exists but URL is missing
      if (module.imageDescription && !module.imageUrl) {
        try {
          module.imageUrl = await ImageGenerationService.generateImage(module.imageDescription);
        } catch (error) {
          console.error(`[TrainingJourneyService] Failed to generate image for module: ${module.title}`, error);
        }
      }

      if (module.sections) {
        for (const section of module.sections) {
          // Generate section image if description exists but URL is missing
          if (section.imageDescription && !section.imageUrl) {
            try {
              section.imageUrl = await ImageGenerationService.generateImage(section.imageDescription);
            } catch (error) {
              console.error(`[TrainingJourneyService] Failed to generate image for section: ${section.title}`, error);
            }
          }
        }
      }
    }
  }

  async saveJourney(journeyData: Partial<ITrainingJourney>): Promise<ITrainingJourney> {
    this.ensureObjectIds(journeyData);
    const pres = (journeyData as { presentation?: { slides?: unknown[] } }).presentation;
    if (pres?.slides && Array.isArray(pres.slides)) {
      ensurePresentationSlideIdsOnSlides(pres.slides);
    }

    // Automatically populate images if descriptions are present
    await this.populateImages(journeyData);

    if (journeyData._id) {
      const existing = await TrainingJourney.findById(journeyData._id);
      if (!existing) {
        throw new AppError('Journey not found', 404);
      }

      Object.assign(existing, journeyData);
      existing.updatedAt = new Date();

      if (journeyData.presentation) {
        existing.markModified('presentation');
      }
      if (journeyData.modules) {
        existing.markModified('modules');
      }

      await existing.save();
      return existing;
    }

    const journey = await TrainingJourney.create(journeyData);
    return journey;
  }

  async launchJourney(
    journeyId: string,
    enrolledRepIds: string[]
  ): Promise<ITrainingJourney> {
    const journey = await TrainingJourney.findById(journeyId);
    if (!journey) {
      throw new AppError('Journey not found', 404);
    }

    this.ensureObjectIds(journey);

    journey.status = 'active';
    journey.enrolledRepIds = enrolledRepIds;
    journey.launchDate = new Date();

    await journey.save();
    return journey;
  }

  async getJourneyById(id: string): Promise<ITrainingJourney> {
    const journey = await TrainingJourney.findById(id);
    if (!journey) {
      throw new AppError('Journey not found', 404);
    }
    return journey;
  }

  async getAllJourneys(): Promise<ITrainingJourney[]> {
    return await TrainingJourney.find();
  }

  async getJourneysByStatus(status: string): Promise<ITrainingJourney[]> {
    return await TrainingJourney.find({ status });
  }

  async getJourneysByIndustry(industry: string): Promise<ITrainingJourney[]> {
    return await TrainingJourney.find({ industry });
  }

  async getJourneysForRep(repId: string): Promise<ITrainingJourney[]> {
    const id = String(repId || '').trim();
    if (!id) return [];
    const variants = [id];
    if (mongoose.Types.ObjectId.isValid(id)) {
      variants.push(new mongoose.Types.ObjectId(id).toString());
    }
    return await TrainingJourney.find({ enrolledRepIds: { $in: [...new Set(variants)] } })
      .populate('gigId', '_id title status companyId')
      .sort({ updatedAt: -1 });
  }

  async getAllAvailableJourneysForTrainees(): Promise<ITrainingJourney[]> {
    return await TrainingJourney.find({
      status: { $in: ['active', 'completed'] }
    });
  }

  async deleteJourney(id: string): Promise<void> {
    const result = await TrainingJourney.findByIdAndDelete(id);
    if (!result) {
      throw new AppError('Journey not found', 404);
    }
  }

  async archiveJourney(id: string): Promise<ITrainingJourney> {
    const journey = await TrainingJourney.findByIdAndUpdate(
      id,
      { status: 'archived', updatedAt: new Date() },
      { new: true }
    );

    if (!journey) {
      throw new AppError('Journey not found', 404);
    }

    return journey;
  }

  async getJourneysByCompanyAndGig(
    companyId: string,
    gigId?: string
  ): Promise<ITrainingJourney[]> {
    const cid = String(companyId || '').trim();
    if (!cid) return [];

    const companyClauses: Record<string, unknown>[] = [{ companyId: cid }];
    if (mongoose.Types.ObjectId.isValid(cid)) {
      companyClauses.push({ companyId: new mongoose.Types.ObjectId(cid) });
    }
    // Legacy payloads sometimes stored a string id on `company` (not in current schema)
    companyClauses.push({ company: cid });

    const gid = gigId != null ? String(gigId).trim() : '';
    if (gid) {
      const gigClauses: Record<string, unknown>[] = [{ gigId: gid }];
      if (mongoose.Types.ObjectId.isValid(gid)) {
        gigClauses.push({ gigId: new mongoose.Types.ObjectId(gid) });
      }
      return await TrainingJourney.find({
        $and: [{ $or: companyClauses }, { $or: gigClauses }]
      })
        .populate('gigId', '_id title status companyId')
        .sort({ updatedAt: -1 });
    }

    return await TrainingJourney.find({ $or: companyClauses })
      .populate('gigId', '_id title status companyId')
      .sort({ updatedAt: -1 });
  }

  async getJourneysByGigId(gigId: string): Promise<ITrainingJourney[]> {
    return await TrainingJourney.find({ gigId })
      .populate('gigId', '_id title status companyId')
      .sort({ updatedAt: -1 });
  }

  /** Trainee-facing: journeys tied to a gig and visible to enrolled reps (not draft/archived). */
  async getPublishedJourneysByGigId(gigId: string): Promise<ITrainingJourney[]> {
    const gid = String(gigId || '').trim();
    if (!gid) return [];

    const gigClauses: Record<string, unknown>[] = [{ gigId: gid }];
    if (mongoose.Types.ObjectId.isValid(gid)) {
      gigClauses.push({ gigId: new mongoose.Types.ObjectId(gid) });
    }

    const query = {
      $and: [
        { $or: gigClauses },
        { status: { $in: ['active', 'rehearsal', 'completed'] } }
      ]
    };
    console.log('[TrainingJourneyService:getPublishedJourneysByGigId] query', {
      requestedGigId: gid,
      hasObjectIdVariant: mongoose.Types.ObjectId.isValid(gid),
      statuses: ['active', 'rehearsal', 'completed']
    });

    const journeys = await TrainingJourney.find(query)
      .populate('gigId', '_id title status companyId')
      .sort({ updatedAt: -1 });

    console.log('[TrainingJourneyService:getPublishedJourneysByGigId] result', {
      requestedGigId: gid,
      count: journeys.length,
      sample: journeys.slice(0, 3).map((j: any) => ({
        id: String(j?._id || ''),
        title: j?.title || j?.name || '',
        status: j?.status || '',
        gigId: String((j as any)?.gigId?._id || (j as any)?.gigId || '')
      }))
    });
    return journeys;
  }

  async getTrainerDashboard(companyId: string, gigId?: string) {
    const journeys = await this.getJourneysByCompanyAndGig(companyId, gigId);
    const journeysWithLogo = journeys.map((journey: any) => {
      const base = typeof journey?.toObject === 'function' ? journey.toObject() : journey;
      return {
        ...base,
        trainingLogo: this.resolveTrainingLogo(journey)
      };
    });

    const enrolledRepIds = new Set<string>();
    journeys.forEach(journey => {
      if (journey.enrolledRepIds) {
        journey.enrolledRepIds.forEach(id => enrolledRepIds.add(id));
      }
    });

    if (enrolledRepIds.size === 0) {
      return {
        journeys: journeysWithLogo,
        totalTrainees: 0,
        activeTrainees: 0,
        completionRate: 0,
        averageEngagement: 0,
        topPerformers: [],
        strugglingTrainees: [],
        upcomingDeadlines: [],
        aiInsights: [{
          id: 'insight-no-trainees',
          title: 'No Trainees Enrolled',
          description: `You have ${journeys.length} journey(s) but no trainees are enrolled yet.`,
          priority: 'low',
          suggestedActions: ['Launch a journey and enroll trainees']
        }]
      };
    }

    const repProgressList = await RepProgress.find({
      journeyId: { $in: journeys.map(j => j._id) }
    });

    const reps = await Rep.find({
      _id: { $in: Array.from(enrolledRepIds) }
    });

    const repMap = new Map(reps.map(r => [r._id.toString(), r]));

    let activeCount = 0;
    let completedCount = 0;
    let totalEngagement = 0;

    const traineeInfoList = Array.from(enrolledRepIds).map(repId => {
      const rep = repMap.get(repId);
      if (!rep) return null;

      const progress = repProgressList.filter(p => p.repId === repId);

      let avgProgress = 0;
      let avgEngagement = 0;

      if (progress.length > 0) {
        const allProgresses: number[] = [];
        const allEngagements: number[] = [];

        progress.forEach(p => {
          if (p.modules) {
            p.modules.forEach(module => {
              allProgresses.push(module.progress);
            });
          }
          allEngagements.push(p.engagementScore);

          if (p.moduleInProgress > 0) activeCount++;
          if (p.moduleTotal > 0 && p.moduleFinished === p.moduleTotal) completedCount++;
        });

        avgProgress = allProgresses.length > 0
          ? allProgresses.reduce((a, b) => a + b, 0) / allProgresses.length
          : 0;

        avgEngagement = allEngagements.length > 0
          ? allEngagements.reduce((a, b) => a + b, 0) / allEngagements.length
          : 0;
      }

      totalEngagement += avgEngagement;

      return {
        id: repId,
        name: rep.name,
        email: rep.email,
        department: rep.department || 'Unknown',
        progress: avgProgress,
        engagement: avgEngagement,
        lastActive: 'Recently'
      };
    }).filter(Boolean);

    const validRepCount = traineeInfoList.length;

    return {
      journeys: journeysWithLogo,
      totalTrainees: validRepCount,
      activeTrainees: activeCount,
      completionRate: validRepCount > 0 ? (completedCount / validRepCount) * 100 : 0,
      averageEngagement: validRepCount > 0 ? totalEngagement / validRepCount : 0,
      topPerformers: traineeInfoList
        .sort((a: any, b: any) =>
          ((b.progress + b.engagement) / 2) - ((a.progress + a.engagement) / 2)
        )
        .slice(0, 5),
      strugglingTrainees: traineeInfoList
        .filter((t: any) => t.progress < 50 || t.engagement < 50)
        .sort((a: any, b: any) =>
          ((a.progress + a.engagement) / 2) - ((b.progress + b.engagement) / 2)
        )
        .slice(0, 5),
      upcomingDeadlines: [],
      aiInsights: []
    };
  }

  async getRepProgress(repId: string, journeyId: string) {
    const rid = String(repId || '').trim();
    const jid = String(journeyId || '').trim();
    if (!rid || !jid) return null;
    return await RepProgress.findOne({ repId: rid, journeyId: jid });
  }

  async upsertRepProgress(input: {
    repId: string;
    journeyId: string;
    moduleId?: string;
    progress?: number;
    status?: 'not_started' | 'in_progress' | 'completed';
    completedSections?: string[];
    engagementScore?: number;
  }) {
    const rid = String(input.repId || '').trim();
    const jid = String(input.journeyId || '').trim();
    if (!rid || !jid) throw new AppError('repId and journeyId are required', 400);

    const journey = await TrainingJourney.findById(jid).select('_id modules');
    const moduleTotal = Array.isArray((journey as any)?.modules) ? (journey as any).modules.length : 0;

    const doc = await RepProgress.findOneAndUpdate(
      { repId: rid, journeyId: jid },
      {
        $setOnInsert: {
          repId: rid,
          journeyId: jid,
          moduleTotal,
          moduleFinished: 0,
          moduleInProgress: 0,
          modules: new Map()
        }
      },
      { new: true, upsert: true }
    );

    const hasModuleUpdate = !!input.moduleId;
    if (hasModuleUpdate) {
      const mId = String(input.moduleId || '').trim();
      if (mId) {
        const current = (doc.modules?.get(mId) as any) || {
          moduleId: mId,
          progress: 0,
          status: 'not_started',
          completedSections: [],
          quizScores: []
        };
        const nextProgress = Math.max(0, Math.min(100, Math.round(Number(input.progress ?? current.progress ?? 0))));
        const nextStatus =
          input.status ||
          (nextProgress >= 100 ? 'completed' : nextProgress > 0 ? 'in_progress' : 'not_started');
        const nextCompletedSections = Array.isArray(input.completedSections)
          ? input.completedSections.map((s) => String(s))
          : current.completedSections || [];

        doc.modules.set(mId, {
          ...current,
          moduleId: mId,
          progress: nextProgress,
          status: nextStatus,
          completedSections: nextCompletedSections
        });
      }
    }

    if (typeof input.engagementScore === 'number' && Number.isFinite(input.engagementScore)) {
      doc.engagementScore = Math.max(0, Math.min(100, Math.round(input.engagementScore)));
    }
    doc.lastAccessed = new Date();

    const modules = Array.from(doc.modules.values()) as any[];
    doc.moduleInProgress = modules.filter((m) => m?.status === 'in_progress').length;
    doc.moduleFinished = modules.filter((m) => m?.status === 'completed' || Number(m?.progress) >= 100).length;
    if (doc.moduleTotal > 0 && doc.moduleFinished >= doc.moduleTotal) {
      doc.completedAt = new Date();
    }

    await doc.save();
    return doc;
  }

  async getTrainingProgressByRep(repId: string) {
    const rid = String(repId || '').trim();
    if (!rid) return [];
    return await RepProgress.find({ repId: rid }).sort({ updatedAt: -1 });
  }

  /**
   * Moyenne des ratios slides / formation.
   * Si `gigId` est fourni : uniquement les formations **publiées** (active / rehearsal / completed) rattachées à ce gig.
   * Sinon : union des parcours présents dans le tracking ou rep_progress (comportement historique).
   */
  async getRepSlideProgressSummary(repId: string, gigId?: string): Promise<RepSlideProgressSummary> {
    const empty = (): RepSlideProgressSummary => ({
      trainingCount: 0,
      journeys: [],
      sumOfRatios: 0,
      averageRatio: 0,
      overallPercent: 0,
      formulaHuman: ''
    });

    const rid = String(repId || '').trim();
    if (!rid || !mongoose.Types.ObjectId.isValid(rid)) return empty();

    const repOid = new mongoose.Types.ObjectId(rid);
    const gid = String(gigId || '').trim();

    const [trackings, progresses] = await Promise.all([
      RepTrainingTracking.find({ repId: repOid }).lean(),
      RepProgress.find({ repId: rid }).lean()
    ]);

    const trackingByJourney = new Map<string, (typeof trackings)[0]>();
    for (const t of trackings) {
      if (t?.journeyId) trackingByJourney.set(String(t.journeyId), t);
    }
    const progressByJourney = new Map<string, (typeof progresses)[0]>();
    for (const p of progresses) {
      if (p?.journeyId) progressByJourney.set(String(p.journeyId), p);
    }

    type JourneyDocLite = { _id: unknown; title?: unknown; presentation?: { slides?: unknown } };
    let journeyDocs: JourneyDocLite[] = [];

    if (gid) {
      const published = await this.getPublishedJourneysByGigId(gid);
      journeyDocs = published.map((j: any) => ({
        _id: j._id,
        title: j.title,
        presentation: j.presentation
      }));
      if (journeyDocs.length === 0) {
        const e = empty();
        e.formulaHuman = 'Aucune formation publiée pour ce gig.';
        return e;
      }
    } else {
      const journeyIds = new Set<string>();
      for (const t of trackings) {
        if (t?.journeyId) journeyIds.add(String(t.journeyId));
      }
      for (const p of progresses) {
        if (p?.journeyId) journeyIds.add(String(p.journeyId));
      }

      if (journeyIds.size === 0) {
        const e = empty();
        e.formulaHuman = 'Aucune formation avec suivi pour ce rep.';
        return e;
      }

      const oids = [...journeyIds]
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
      const found = await TrainingJourney.find({ _id: { $in: oids } }).select('title presentation').lean();
      journeyDocs = found as JourneyDocLite[];
    }

    const jMap = new Map<string, JourneyDocLite>();
    for (const doc of journeyDocs) {
      jMap.set(String(doc._id), doc);
    }

    const journeys: RepSlideProgressJourneyLine[] = [];

    for (const jid of [...jMap.keys()].sort()) {
      const doc = jMap.get(jid) ?? null;
      let slidesTotal = countSlidesOnJourney(doc);
      const tr = trackingByJourney.get(jid);
      const trLegacy = tr as Record<string, unknown> | undefined;
      const metaCount =
        trLegacy?.meta &&
        typeof trLegacy.meta === 'object' &&
        trLegacy.meta !== null &&
        typeof (trLegacy.meta as { slideCount?: unknown }).slideCount === 'number'
          ? Math.floor(Number((trLegacy.meta as { slideCount: number }).slideCount))
          : 0;
      if (slidesTotal <= 0 && metaCount > 0) slidesTotal = metaCount;

      let slidesSeen = 0;
      if (slidesTotal > 0) {
        const completedFromMap = tr ? countCompletedInTrackingSlides(tr as Record<string, unknown>) : 0;
        if (completedFromMap > 0) {
          slidesSeen = Math.min(completedFromMap, slidesTotal);
        } else if (trLegacy && typeof trLegacy.slideIndex === 'number') {
          const si = trLegacy.slideIndex;
          if (si >= 0) slidesSeen = Math.min(Math.floor(si) + 1, slidesTotal);
        } else {
          const pr = progressByJourney.get(jid);
          if (pr && typeof pr.engagementScore === 'number' && Number.isFinite(pr.engagementScore)) {
            const eng = Math.max(0, Math.min(100, Math.round(pr.engagementScore)));
            slidesSeen = Math.min(Math.round((eng / 100) * slidesTotal), slidesTotal);
          }
        }
      }

      const ratio = slidesTotal > 0 ? slidesSeen / slidesTotal : 0;
      const pr = progressByJourney.get(jid) ?? null;
      const currentSlideIndex =
        slidesTotal > 0
          ? resolveCurrentSlideIndex(doc, tr as Record<string, unknown> | undefined, pr, slidesTotal)
          : 0;
      journeys.push({
        journeyId: jid,
        journeyTitle: String(doc?.title || 'Formation'),
        slidesSeen,
        slidesTotal,
        ratio,
        currentSlideIndex
      });
    }

    const trainingCount = journeys.length;
    const sumOfRatios = journeys.reduce((acc, j) => acc + j.ratio, 0);
    const averageRatio = trainingCount > 0 ? sumOfRatios / trainingCount : 0;
    const overallPercent = Math.min(100, Math.round(averageRatio * 100));

    const parts = journeys.map((j) => (j.slidesTotal > 0 ? `${j.slidesSeen}/${j.slidesTotal}` : '0/0'));
    const formulaHuman =
      trainingCount === 0
        ? ''
        : `(${parts.join(' + ')}) ÷ ${trainingCount} ≈ ${overallPercent} % — moyenne des avancements slides par formation`;

    return {
      trainingCount,
      journeys,
      sumOfRatios,
      averageRatio,
      overallPercent,
      formulaHuman
    };
  }

  async getRepProgressByTraining(journeyId: string) {
    const jid = String(journeyId || '').trim();
    if (!jid) return [];
    return await RepProgress.find({ journeyId: jid }).sort({ updatedAt: -1 });
  }

  async recordTrainingTrackingEvent(input: {
    repId: string;
    journeyId: string;
    moduleId?: string;
    slideId?: string;
    slideIndex?: number;
    event: RepTrainingTrackingEventKind | string;
    durationMs?: number;
    /** défaut true : marque la slide comme vue / complétée dans `slides` */
    completed?: boolean;
  }) {
    const repOid = requireObjectId(input.repId, 'repId');
    const journeyOid = requireObjectId(input.journeyId, 'journeyId');

    const ev = String(input.event || '').trim() as RepTrainingTrackingEventKind;
    if (!REP_TRAINING_TRACKING_EVENTS.includes(ev)) {
      throw new AppError(`event must be one of: ${REP_TRAINING_TRACKING_EVENTS.join(', ')}`, 400);
    }

    let slideKey: string;
    const sid = input.slideId != null ? String(input.slideId).trim() : '';
    if (sid && mongoose.Types.ObjectId.isValid(sid)) {
      slideKey = new mongoose.Types.ObjectId(sid).toString();
    } else if (typeof input.slideIndex === 'number' && Number.isFinite(input.slideIndex) && input.slideIndex >= 0) {
      const journey = await TrainingJourney.findById(journeyOid).select('presentation');
      const slides = (journey?.presentation as { slides?: unknown[] } | undefined)?.slides;
      if (!Array.isArray(slides) || slides.length === 0) {
        throw new AppError('Journey has no slides', 400);
      }
      const changed = ensurePresentationSlideIdsOnSlides(slides as unknown[]);
      if (changed && journey) {
        journey.markModified('presentation');
        await journey.save();
      }
      const idx = Math.min(Math.floor(input.slideIndex), slides.length - 1);
      const slide = slides[idx] as { _id?: unknown };
      if (!slide?._id || !mongoose.Types.ObjectId.isValid(String(slide._id))) {
        throw new AppError('Could not resolve slide id', 400);
      }
      slideKey = new mongoose.Types.ObjectId(String(slide._id)).toString();
    } else {
      throw new AppError('slideId (ObjectId) or slideIndex is required', 400);
    }

    const completed = input.completed !== false;
    const $set: Record<string, unknown> = {
      repId: repOid,
      journeyId: journeyOid,
      event: ev,
      [`slides.${slideKey}`]: { completed }
    };
    if (input.moduleId != null && String(input.moduleId).trim()) {
      const rawModuleId = String(input.moduleId).trim();
      if (mongoose.Types.ObjectId.isValid(rawModuleId)) {
        $set.moduleId = new mongoose.Types.ObjectId(rawModuleId);
      }
    }
    if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs >= 0) {
      $set.durationMs = Math.floor(input.durationMs);
    }

    return await RepTrainingTracking.findOneAndUpdate(
      { repId: repOid, journeyId: journeyOid },
      { $set },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  async listTrainingTrackingEvents(opts: { repId: string; journeyId: string; limit?: number; skip?: number }) {
    const repOid = requireObjectId(opts.repId, 'repId');
    const journeyOid = requireObjectId(opts.journeyId, 'journeyId');
    const doc = await RepTrainingTracking.findOne({ repId: repOid, journeyId: journeyOid }).lean();
    return doc ? [doc] : [];
  }

  /** Tous les suivis snapshot pour un rep (une ligne par formation suivie). */
  async listTrainingTrackingByRep(repId: string) {
    const repOid = requireObjectId(repId, 'repId');
    return await RepTrainingTracking.find({ repId: repOid }).sort({ updatedAt: -1 }).lean();
  }
}

export default new TrainingJourneyService();
