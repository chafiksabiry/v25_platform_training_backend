/**
 * Backfill (seed) des certificats pour les reps ayant DÉJÀ terminé des formations.
 *
 * Parcourt tous les RepTrainingTracking au statut `completed` et crée le document
 * Certification correspondant (idempotent) dans la collection `certifications`.
 *
 * Lancer :  npm run seed:certifications
 *           (ou)  ts-node src/scripts/seedCertifications.ts
 */
import 'dotenv/config';
import crypto from 'crypto';
import mongoose from 'mongoose';

import Certification from '../models/Certification';
import RepTrainingTracking from '../models/rep_training_tracking.model';
import TrainingJourney from '../models/TrainingJourney';
import Rep from '../models/Rep';
import Agent from '../models/Agent';

/** Identifiant public stable, identique à celui du service (déterministe par (rep, formation)). */
function buildCertificateId(repId: string, journeyId: string): string {
  const hash = crypto.createHash('sha1').update(`${repId}|${journeyId}`).digest('hex');
  const code = parseInt(hash.slice(0, 12), 16)
    .toString(36)
    .toUpperCase()
    .padStart(7, '0')
    .slice(0, 7);
  return `CERT-${code}`;
}

function computeFinalScore(tracking: any): number | undefined {
  const scores: number[] = [];
  for (const mod of (tracking.modules || [])) {
    for (const quiz of (mod.quizzes || [])) {
      if (typeof quiz?.score === 'number' && quiz?.passed) scores.push(quiz.score);
    }
  }
  if (scores.length) return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  if (typeof tracking.engagementScore === 'number') return Math.round(tracking.engagementScore);
  return undefined;
}

function optionalObjectId(raw: unknown): mongoose.Types.ObjectId | undefined {
  const s = String(raw ?? '').trim();
  if (!s || !mongoose.Types.ObjectId.isValid(s)) return undefined;
  return new mongoose.Types.ObjectId(s);
}

async function main(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI || '';
  if (!mongoUri) {
    console.error('❌ MONGODB_URI manquant dans les variables d\'environnement.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri, { dbName: process.env.DB_NAME || 'harx' });
  console.log('✅ Connecté à MongoDB:', mongoose.connection.host, '/', mongoose.connection.name);

  const completed = await RepTrainingTracking.find({ status: 'completed' });
  console.log(`🔎 ${completed.length} formation(s) terminée(s) trouvée(s).`);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const tracking of completed) {
    const repId = tracking.repId;
    const journeyId = tracking.journeyId || tracking.courseId;
    if (!repId || !journeyId) {
      skipped += 1;
      continue;
    }

    try {
      const existing = await Certification.findOne({ repId, journeyId });
      if (existing) {
        skipped += 1;
        continue;
      }

      const journey = await TrainingJourney.findById(journeyId).select('title companyId gigId');
      const rep = await Rep.findById(repId).select('name companyId gigId');
      const agent = await Agent.findById(repId).select('personalInfo.name companyId');
      const traineeName = (agent?.personalInfo?.name || rep?.name || 'Trainee').trim();

      const issuedAt = tracking.certificationIssuedAt || tracking.completedAt || tracking.updatedAt || new Date();
      const finalScore = computeFinalScore(tracking);
      const companyId = optionalObjectId(journey?.companyId) || optionalObjectId((agent as any)?.companyId) || optionalObjectId((rep as any)?.companyId);
      const gigId = optionalObjectId(journey?.gigId) || optionalObjectId((rep as any)?.gigId);

      await Certification.create({
        certificateId: buildCertificateId(String(repId), String(journeyId)),
        repId,
        journeyId,
        ...(companyId ? { companyId } : {}),
        ...(gigId ? { gigId } : {}),
        traineeName,
        trainingTitle: journey?.title || 'Training',
        level: 'Expert',
        ...(finalScore !== undefined ? { finalScore } : {}),
        status: 'certified',
        issuedAt
      });

      // Garder le tracking cohérent (date d'émission) + le journey à jour.
      if (!tracking.certificationIssuedAt) {
        tracking.certificationIssuedAt = issuedAt;
        await tracking.save();
      }
      await TrainingJourney.updateOne(
        { _id: journeyId },
        { $addToSet: { certifications: { repId, issuedAt } } }
      );

      created += 1;
      console.log(`  ➕ Certificat créé: rep=${repId} journey=${journeyId}`);
    } catch (err: any) {
      // Doublon possible si exécution concurrente — on l'ignore proprement.
      if (err?.code === 11000) {
        skipped += 1;
      } else {
        failed += 1;
        console.error(`  ⚠️  Échec rep=${repId} journey=${journeyId}:`, err?.message || err);
      }
    }
  }

  console.log('\n📊 Résumé du seed des certifications:');
  console.log(`   • créés   : ${created}`);
  console.log(`   • ignorés : ${skipped} (déjà existants ou incomplets)`);
  console.log(`   • échecs  : ${failed}`);

  await mongoose.disconnect();
  console.log('👋 Déconnecté. Terminé.');
  process.exit(0);
}

main().catch(async (err) => {
  console.error('💥 Erreur fatale du seed:', err);
  try { await mongoose.disconnect(); } catch { /* noop */ }
  process.exit(1);
});
