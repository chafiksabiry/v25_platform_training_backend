import mongoose, { Schema, Document } from 'mongoose';

export interface IModuleProgress {
  moduleId: mongoose.Types.ObjectId;
  progress: number;
  status: string;
  completedSections: mongoose.Types.ObjectId[];
  durationMs?: number;
  quizScores: Array<{
    quizId: mongoose.Types.ObjectId;
    score: number;
    attempts: number;
    passed: boolean;
  }>;
}

export interface IRepProgress extends Document {
  repId: mongoose.Types.ObjectId;
  journeyId: mongoose.Types.ObjectId;
  moduleTotal: number;
  moduleFinished: number;
  moduleInProgress: number;
  modules: Map<string, IModuleProgress>;
  engagementScore: number;
  totalDurationMs: number;
  lastAccessed?: Date;
  finalExamScore?: number;
  finalExamPassed?: boolean;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const moduleProgressSchema = new Schema(
  {
    moduleId: { type: Schema.Types.ObjectId, required: true },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    status: {
      type: String,
      default: 'not_started',
      enum: ['not_started', 'in_progress', 'completed']
    },
    completedSections: [{ type: Schema.Types.ObjectId }],
    durationMs: { type: Number, default: 0, min: 0 },
    quizScores: [{
      quizId: { type: Schema.Types.ObjectId, required: true },
      score: { type: Number, default: 0 },
      attempts: { type: Number, default: 0 },
      passed: { type: Boolean, default: false }
    }]
  },
  { _id: false }
);

const repProgressSchema = new Schema<IRepProgress>(
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
    moduleTotal: {
      type: Number,
      default: 0
    },
    moduleFinished: {
      type: Number,
      default: 0
    },
    moduleInProgress: {
      type: Number,
      default: 0
    },
    modules: {
      type: Map,
      of: moduleProgressSchema,
      default: new Map()
    },
    engagementScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    totalDurationMs: {
      type: Number,
      default: 0,
      min: 0
    },
    lastAccessed: {
      type: Date
    },
    finalExamScore: {
      type: Number,
      min: 0,
      max: 100
    },
    finalExamPassed: {
      type: Boolean,
      default: false
    },
    completedAt: {
      type: Date
    }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'rep_progress'
  }
);

repProgressSchema.index({ repId: 1, journeyId: 1 }, { unique: true });
repProgressSchema.index({ repId: 1 });
repProgressSchema.index({ journeyId: 1 });

export default mongoose.model<IRepProgress>('RepProgress', repProgressSchema);
