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

class TrainingJourneyService {
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

    const enrolledRepIds = new Set<string>();
    journeys.forEach(journey => {
      if (journey.enrolledRepIds) {
        journey.enrolledRepIds.forEach(id => enrolledRepIds.add(id));
      }
    });

    if (enrolledRepIds.size === 0) {
      return {
        journeys,
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
      journeys,
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

  async getRepProgressByTraining(journeyId: string) {
    const jid = String(journeyId || '').trim();
    if (!jid) return [];
    return await RepProgress.find({ journeyId: jid }).sort({ updatedAt: -1 });
  }

  async recordTrainingTrackingEvent(input: {
    repId: string;
    journeyId: string;
    moduleId?: string;
    slideIndex?: number;
    event: RepTrainingTrackingEventKind | string;
    durationMs?: number;
    sessionId?: string;
    meta?: Record<string, unknown>;
  }) {
    const repOid = requireObjectId(input.repId, 'repId');
    const journeyOid = requireObjectId(input.journeyId, 'journeyId');

    const ev = String(input.event || '').trim() as RepTrainingTrackingEventKind;
    if (!REP_TRAINING_TRACKING_EVENTS.includes(ev)) {
      throw new AppError(`event must be one of: ${REP_TRAINING_TRACKING_EVENTS.join(', ')}`, 400);
    }

    const $set: Record<string, unknown> = {
      repId: repOid,
      journeyId: journeyOid,
      event: ev
    };
    if (input.moduleId != null && String(input.moduleId).trim()) {
      $set.moduleId = requireObjectId(input.moduleId, 'moduleId');
    }
    if (typeof input.slideIndex === 'number' && Number.isFinite(input.slideIndex) && input.slideIndex >= 0) {
      $set.slideIndex = Math.floor(input.slideIndex);
    }
    if (typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs >= 0) {
      $set.durationMs = Math.floor(input.durationMs);
    }
    if (input.sessionId) $set.sessionId = String(input.sessionId).trim();
    if (input.meta && typeof input.meta === 'object' && !Array.isArray(input.meta)) {
      $set.meta = input.meta;
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
