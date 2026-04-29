import mongoose, { Schema, Document } from 'mongoose';

export type SectionProgressStatus = 'pending' | 'in_progress' | 'completed';
export type QuizProgressStatus = 'pending' | 'in_progress' | 'passed' | 'failed';

export interface ISectionProgressRow {
  sectionKey: string;
  title?: string;
  status: SectionProgressStatus;
  durationMs: number;
  updatedAt?: Date;
}

export interface IQuizProgressRow {
  quizKey: string;
  quizId?: mongoose.Types.ObjectId;
  title?: string;
  status: QuizProgressStatus;
  score: number;
  attempts: number;
  passed: boolean;
  durationMs: number;
  updatedAt?: Date;
}

export interface IModuleProgress {
  moduleId: mongoose.Types.ObjectId;
  progress: number;
  status: string;
  completedSections: mongoose.Types.ObjectId[];
  /** Détail par section (clé stable côté client, pas seulement ObjectId). */
  sectionProgress?: ISectionProgressRow[];
  /** Détail par quiz. */
  quizProgress?: IQuizProgressRow[];
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

const sectionProgressRowSchema = new Schema(
  {
    sectionKey: { type: String, required: true },
    title: { type: String },
    status: {
      type: String,
      default: 'pending',
      enum: ['pending', 'in_progress', 'completed']
    },
    durationMs: { type: Number, default: 0, min: 0 },
    updatedAt: { type: Date }
  },
  { _id: false }
);

const quizProgressRowSchema = new Schema(
  {
    quizKey: { type: String, required: true },
    quizId: { type: Schema.Types.ObjectId },
    title: { type: String },
    status: {
      type: String,
      default: 'pending',
      enum: ['pending', 'in_progress', 'passed', 'failed']
    },
    score: { type: Number, default: 0, min: 0, max: 100 },
    attempts: { type: Number, default: 0, min: 0 },
    passed: { type: Boolean, default: false },
    durationMs: { type: Number, default: 0, min: 0 },
    updatedAt: { type: Date }
  },
  { _id: false }
);

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
    sectionProgress: { type: [sectionProgressRowSchema], default: undefined },
    quizProgress: { type: [quizProgressRowSchema], default: undefined },
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
