/**
 * Backfill lastAnswers pour les quizzes déjà réussis (passed) sans réponses stockées.
 *
 * Temporaire revue formation : réponse reps = bonne réponse du parcours.
 *
 * Lancer :  npm run seed:quiz-last-answers
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import RepTrainingTracking from '../models/rep_training_tracking.model';
import TrainingJourney from '../models/TrainingJourney';

function correctAnswersFromQuizDef(jq: any): number[] {
  const questions = Array.isArray(jq?.questions) ? jq.questions : [];
  return questions.map((q: any) => {
    const n = Number(q?.correctAnswer);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
}

function normalizeId(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'object' && raw !== null && 'toString' in raw) {
    return String((raw as { toString: () => string }).toString()).trim();
  }
  return String(raw).trim();
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri) {
    console.error('❌ MONGODB_URI manquant dans les variables d\'environnement.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri, { dbName: process.env.DB_NAME || 'harx' });
  console.log('✅ Connecté à MongoDB:', mongoose.connection.host, '/', mongoose.connection.name);

  const trackings = await RepTrainingTracking.find({
    'modules.quizzes': { $exists: true, $ne: [] }
  });
  console.log(`🔎 ${trackings.length} tracking(s) avec quizzes.`);

  const journeyCache = new Map<string, any>();
  let updatedDocs = 0;
  let updatedQuizzes = 0;
  let skipped = 0;

  for (const tracking of trackings) {
    const journeyId = normalizeId(tracking.journeyId || tracking.courseId);
    if (!journeyId) {
      skipped += 1;
      continue;
    }

    let journey = journeyCache.get(journeyId);
    if (!journey) {
      journey = await TrainingJourney.findById(journeyId).select('modules').lean();
      journeyCache.set(journeyId, journey || null);
    }
    const journeyModules = Array.isArray(journey?.modules) ? journey.modules : [];
    if (journeyModules.length === 0) {
      skipped += 1;
      continue;
    }

    let docChanged = false;
    const modules = Array.isArray(tracking.modules) ? tracking.modules : [];
    for (let mi = 0; mi < modules.length; mi++) {
      const mod = modules[mi] as any;
      const mid = normalizeId(mod?.moduleId);
      const jm =
        journeyModules.find(
          (m: any) => normalizeId(m?._id) === mid || normalizeId(m?.id) === mid
        ) || journeyModules[mi];
      const defs = Array.isArray(jm?.quizzes) ? jm.quizzes : [];
      const quizzes = Array.isArray(mod?.quizzes) ? mod.quizzes : [];
      for (const q of quizzes) {
        const passed = !!q?.passed || String(q?.status || '') === 'completed';
        if (!passed) continue;
        if (Array.isArray(q?.lastAnswers) && q.lastAnswers.length > 0) continue;
        const qid = normalizeId(q?.quizId);
        const jq =
          defs.find((d: any) => normalizeId(d?._id) === qid || normalizeId(d?.id) === qid) ||
          null;
        const answers = correctAnswersFromQuizDef(jq);
        if (answers.length === 0) continue;
        q.lastAnswers = answers;
        docChanged = true;
        updatedQuizzes += 1;
      }
    }

    if (docChanged) {
      tracking.markModified('modules');
      await tracking.save();
      updatedDocs += 1;
    }
  }

  console.log(
    `✅ Seed terminé — docs mis à jour: ${updatedDocs}, quizzes seedés: ${updatedQuizzes}, ignorés: ${skipped}`
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('❌ Seed quiz lastAnswers échoué:', err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
