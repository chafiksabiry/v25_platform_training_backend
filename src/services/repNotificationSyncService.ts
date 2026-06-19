import mongoose from 'mongoose';
import RepNotification from '../models/RepNotification';
import TrainingJourney from '../models/TrainingJourney';
import {
  isScriptRequirementModule,
  SCRIPT_REQUIREMENT_MARKER,
} from './scriptModuleService';

export function scriptNotificationKey(journeyId: string): string {
  return `script-required-${journeyId}`;
}

function isScriptModulePending(
  journeyModules: any[],
  structuredModules: any[] | undefined
): boolean {
  const scriptIdx = journeyModules.findIndex((m) => isScriptRequirementModule(m));
  if (scriptIdx < 0) return false;

  const scriptMod = journeyModules[scriptIdx];
  const moduleId = String(scriptMod?._id || scriptMod?.id || scriptIdx);

  const fromStructured = (structuredModules || []).find(
    (m: any) => String(m?.moduleId) === moduleId || String(m?.moduleId) === String(scriptIdx)
  );
  if (fromStructured?.status === 'completed') return false;

  return true;
}

function isJourneyCompleted(
  trackingStatus: string | undefined,
  progressPercentage: number | undefined,
  summaryRatio?: number
): boolean {
  if (trackingStatus === 'completed') return true;
  if (typeof progressPercentage === 'number' && progressPercentage >= 100) return true;
  if (typeof summaryRatio === 'number' && summaryRatio >= 1) return true;
  return false;
}

class RepNotificationSyncService {
  async upsertScriptNotification(input: {
    repId: string;
    journeyId: string;
    gigId?: string;
    title: string;
    message: string;
    actionPath?: string;
  }) {
    const repOid = new mongoose.Types.ObjectId(input.repId);
    const key = scriptNotificationKey(input.journeyId);

    const update: Record<string, unknown> = {
      kind: 'script_required',
      title: input.title,
      message: input.message,
      actionPath: input.actionPath,
      journeyId: new mongoose.Types.ObjectId(input.journeyId),
    };
    if (input.gigId && mongoose.Types.ObjectId.isValid(input.gigId)) {
      update.gigId = new mongoose.Types.ObjectId(input.gigId);
    }

    const existing = await RepNotification.findOne({ repId: repOid, notificationKey: key }).lean();
    await RepNotification.findOneAndUpdate(
      { repId: repOid, notificationKey: key },
      {
        $set: update,
        $setOnInsert: { repId: repOid, notificationKey: key, read: false },
      },
      { upsert: true, new: true }
    );

    return { created: !existing };
  }

  async removeScriptNotification(repId: string, journeyId: string) {
    const repOid = new mongoose.Types.ObjectId(repId);
    const key = scriptNotificationKey(journeyId);
    await RepNotification.deleteOne({ repId: repOid, notificationKey: key });
  }

  /**
   * Crée ou retire les notifications script pour toutes les formations du rep.
   */
  async syncScriptNotificationsForRep(repId: string) {
    const rid = String(repId || '').trim();
    if (!rid || !mongoose.Types.ObjectId.isValid(rid)) return;

    const journeys = await TrainingJourney.find({
      $or: [{ enrolledRepIds: new mongoose.Types.ObjectId(rid) }, { repId: new mongoose.Types.ObjectId(rid) }],
    }).select('_id title name gigId modules status');

    const trainingJourneyService = (await import('./trainingJourneyService')).default;

    let summaryJourneys: Array<{ journeyId: string; ratio?: number }> = [];
    try {
      const summary = await trainingJourneyService.getRepSlideProgressSummary(rid);
      summaryJourneys = Array.isArray(summary?.journeys) ? summary.journeys : [];
    } catch {
      summaryJourneys = [];
    }

    for (const journey of journeys) {
      const jid = String(journey._id);
      const modules = Array.isArray(journey.modules) ? journey.modules : [];
      const hasScriptModule = modules.some((m) => isScriptRequirementModule(m));
      if (!hasScriptModule) {
        await this.removeScriptNotification(rid, jid);
        continue;
      }

      let structured: any = null;
      try {
        structured = await trainingJourneyService.getStructuredProgress(rid, jid);
      } catch {
        structured = null;
      }

      const summaryRow = summaryJourneys.find((j) => j.journeyId === jid);
      const completed = isJourneyCompleted(
        String(structured?.status || ''),
        Number(structured?.progressPercentage),
        typeof summaryRow?.ratio === 'number' ? summaryRow.ratio : undefined
      );

      const scriptPending = isScriptModulePending(modules, structured?.modules);

      if (completed && scriptPending) {
        const trainingTitle = String(journey.title || journey.name || 'Formation');
        const gigId = journey.gigId ? String(journey.gigId) : undefined;
        await this.upsertScriptNotification({
          repId: rid,
          journeyId: jid,
          gigId,
          title: "Script d'appel à compléter",
          message: `Formation « ${trainingTitle} » : lisez et validez le module script (obligatoire pour le cockpit).`,
          actionPath: gigId ? `/training?gigId=${encodeURIComponent(gigId)}` : '/training',
        });
      } else {
        await this.removeScriptNotification(rid, jid);
      }
    }
  }

  scheduleSyncForRep(repId: string) {
    void this.syncScriptNotificationsForRep(repId).catch((err) => {
      console.warn('[RepNotificationSyncService] sync failed', repId, err?.message || err);
    });
  }
}

export { SCRIPT_REQUIREMENT_MARKER };
export default new RepNotificationSyncService();
