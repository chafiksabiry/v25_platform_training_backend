import mongoose, { Schema, Document } from 'mongoose';

/**
 * Granular training activity events (append-only).
 * Complements {@link RepProgress}, which stores rolled-up state per rep + journey.
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
  repId: string;
  journeyId: string;
  moduleId?: string;
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
      type: String,
      required: true,
      ref: 'Rep'
    },
    journeyId: {
      type: String,
      required: true,
      ref: 'TrainingJourney'
    },
    moduleId: { type: String },
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

repTrainingTrackingSchema.index({ repId: 1, journeyId: 1, createdAt: -1 });
repTrainingTrackingSchema.index({ journeyId: 1, createdAt: -1 });
repTrainingTrackingSchema.index({ sessionId: 1, createdAt: -1 }, { sparse: true });

export default mongoose.model<IRepTrainingTracking>('RepTrainingTracking', repTrainingTrackingSchema);
