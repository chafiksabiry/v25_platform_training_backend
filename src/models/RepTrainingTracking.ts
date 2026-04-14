import mongoose, { Schema, Document, Types } from 'mongoose';

/**
 * Dernière position pour un couple rep + parcours (upsert unique).
 * `slides` : Map slideId (ObjectId hex) → { completed }.
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

const slideStateSchema = new Schema(
  {
    completed: { type: Boolean, default: false }
  },
  { _id: false }
);

export interface IRepTrainingTracking extends Document {
  repId: Types.ObjectId;
  journeyId: Types.ObjectId;
  moduleId?: Types.ObjectId;
  slides: Map<string, { completed: boolean }>;
  event: RepTrainingTrackingEventKind;
  durationMs?: number;
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
    slides: {
      type: Map,
      of: slideStateSchema,
      default: () => new Map()
    },
    event: {
      type: String,
      required: true,
      enum: [...REP_TRAINING_TRACKING_EVENTS]
    },
    durationMs: { type: Number, min: 0 }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'rep_training_tracking'
  }
);

repTrainingTrackingSchema.index({ repId: 1, journeyId: 1 }, { unique: true });
repTrainingTrackingSchema.index({ journeyId: 1 });

export default mongoose.model<IRepTrainingTracking>('RepTrainingTracking', repTrainingTrackingSchema);
