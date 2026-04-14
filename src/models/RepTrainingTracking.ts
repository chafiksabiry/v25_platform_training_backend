import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Dernière position / dernier événement de suivi pour un couple rep + parcours.
 * Un rep peut avoir plusieurs documents (un par formation / journeyId).
 * Un seul document par (repId, journeyId), mis à jour (upsert).
 * repId, journeyId et moduleId sont stockés en ObjectId BSON (pas en string).
 * Pour l’agrégat métier (modules, scores), voir {@link RepProgress}.
 */
export const REP_TRAINING_TRACKING_EVENTS = [
  'journey_open',
  'journey_close',
  'module_open',
  'slide_view',
  'slide_complete',
  'quiz_submit',
  'session_heartbeat',
  'progress_sync'
] as const;

export type RepTrainingTrackingEventKind = (typeof REP_TRAINING_TRACKING_EVENTS)[number];

export interface IRepTrainingTracking extends Document {
  repId: Types.ObjectId;
  journeyId: Types.ObjectId;
  moduleId?: Types.ObjectId;
  slideIndex?: number;
  event: RepTrainingTrackingEventKind;
  durationMs?: number;
  sessionId?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const repTrainingTrackingSchema = new Schema<IRepTrainingTracking>(
  {
    repId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Rep'
    },
    journeyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'TrainingJourney'
    },
    moduleId: { type: Schema.Types.ObjectId },
    slideIndex: { type: Number, min: 0 },
    event: {
      type: String,
      required: true,
      enum: [...REP_TRAINING_TRACKING_EVENTS]
    },
    durationMs: { type: Number, min: 0 },
    sessionId: { type: String },
    meta: { type: Schema.Types.Mixed }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'rep_training_tracking'
  }
);

repTrainingTrackingSchema.index({ repId: 1, journeyId: 1 }, { unique: true });
repTrainingTrackingSchema.index({ journeyId: 1 });
repTrainingTrackingSchema.index({ sessionId: 1 }, { sparse: true });

export default mongoose.model<IRepTrainingTracking>('RepTrainingTracking', repTrainingTrackingSchema);
