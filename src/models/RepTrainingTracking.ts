import mongoose, { Document, Schema } from 'mongoose';

export const TRAINING_BASE_STATUSES = ['pending', 'in_progress', 'completed', 'locked'] as const;
export const QUIZ_STATUSES = [...TRAINING_BASE_STATUSES, 'failed'] as const;
export type TrainingBaseStatus = (typeof TRAINING_BASE_STATUSES)[number];
export type QuizStatus = (typeof QUIZ_STATUSES)[number];

export const REP_TRAINING_TRACKING_EVENTS = [
  'journey_open',
  'journey_close',
  'module_open',
  'slide_view',
  'slide_complete',
  'quiz_submit',
  'session_heartbeat',
  'progress_sync',
  'slide_viewed',
  'slide_completed',
  'module_started',
  'module_completed',
  'quiz_submitted'
] as const;
export type RepTrainingTrackingEventKind = (typeof REP_TRAINING_TRACKING_EVENTS)[number];

export interface IQuizProgress {
  quizId: mongoose.Types.ObjectId;
  title?: string;
  status: QuizStatus;
  score: number;
  attempts: number;
  passed: boolean;
  lastSubmittedAt?: Date;
}

export interface ISectionProgress {
  sectionId: mongoose.Types.ObjectId;
  title?: string;
  status: TrainingBaseStatus;
  completedAt?: Date;
}

export interface IModuleProgress {
  moduleId: mongoose.Types.ObjectId;
  title?: string;
  status: TrainingBaseStatus;
  sections: ISectionProgress[];
  quizzes: IQuizProgress[];
  progressPercentage: number;
  completedAt?: Date;
}

export interface IUserProgress extends Document {
  repId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  journeyId?: mongoose.Types.ObjectId;
  event?: RepTrainingTrackingEventKind | string;
  moduleId?: mongoose.Types.ObjectId;
  slideIndex?: number;
  slides?: Map<string, { completed?: boolean }>;
  durationMs?: number;
  engagementScore?: number;
  status: TrainingBaseStatus;
  modules: IModuleProgress[];
  progressPercentage: number;
  completedModules: number;
  totalModules: number;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sectionProgressSchema = new Schema<ISectionProgress>(
  {
    sectionId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String },
    status: { type: String, enum: TRAINING_BASE_STATUSES, default: 'pending' },
    completedAt: { type: Date }
  },
  { _id: false }
);

const quizProgressSchema = new Schema<IQuizProgress>(
  {
    quizId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String },
    status: { type: String, enum: QUIZ_STATUSES, default: 'pending' },
    score: { type: Number, min: 0, max: 100, default: 0 },
    attempts: { type: Number, min: 0, default: 0 },
    passed: { type: Boolean, default: false },
    lastSubmittedAt: { type: Date }
  },
  { _id: false }
);

const moduleProgressSchema = new Schema<IModuleProgress>(
  {
    moduleId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String },
    status: { type: String, enum: TRAINING_BASE_STATUSES, default: 'pending' },
    sections: { type: [sectionProgressSchema], default: [] },
    quizzes: { type: [quizProgressSchema], default: [] },
    progressPercentage: { type: Number, min: 0, max: 100, default: 0 },
    completedAt: { type: Date }
  },
  { _id: false }
);

const userProgressSchema = new Schema<IUserProgress>(
  {
    repId: { type: Schema.Types.ObjectId, required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, required: true, index: true, ref: 'TrainingJourney' },
    journeyId: { type: Schema.Types.ObjectId, index: true, ref: 'TrainingJourney' },
    event: { type: String, enum: REP_TRAINING_TRACKING_EVENTS },
    moduleId: { type: Schema.Types.ObjectId },
    slideIndex: { type: Number, min: 0 },
    slides: { type: Map, of: new Schema({ completed: { type: Boolean, default: false } }, { _id: false }) },
    durationMs: { type: Number, min: 0, default: 0 },
    engagementScore: { type: Number, min: 0, max: 100, default: 0 },
    status: { type: String, enum: TRAINING_BASE_STATUSES, default: 'pending' },
    modules: { type: [moduleProgressSchema], default: [] },
    progressPercentage: { type: Number, min: 0, max: 100, default: 0 },
    completedModules: { type: Number, min: 0, default: 0 },
    totalModules: { type: Number, min: 0, default: 0 },
    completedAt: { type: Date }
  },
  {
    timestamps: true,
    collection: 'rep_training_tracking',
    versionKey: false
  }
);

userProgressSchema.index({ repId: 1, courseId: 1 }, { unique: true });
userProgressSchema.index({ repId: 1, journeyId: 1 }, { unique: true, sparse: true });
userProgressSchema.index({ journeyId: 1 });

export default mongoose.model<IUserProgress>('RepTrainingTracking', userProgressSchema);
import mongoose, { Document, Schema } from 'mongoose';

export const TRAINING_BASE_STATUSES = ['pending', 'in_progress', 'completed', 'locked'] as const;
export const QUIZ_STATUSES = [...TRAINING_BASE_STATUSES, 'failed'] as const;
export type TrainingBaseStatus = (typeof TRAINING_BASE_STATUSES)[number];
export type QuizStatus = (typeof QUIZ_STATUSES)[number];

export const REP_TRAINING_TRACKING_EVENTS = [
  'journey_open',
  'journey_close',
  'module_open',
  'slide_view',
  'slide_complete',
  'quiz_submit',
  'session_heartbeat',
  'progress_sync',
  'slide_viewed',
  'slide_completed',
  'module_started',
  'module_completed',
  'quiz_submitted'
] as const;
export type RepTrainingTrackingEventKind = (typeof REP_TRAINING_TRACKING_EVENTS)[number];

export interface IQuizProgress {
  quizId: mongoose.Types.ObjectId;
  title?: string;
  status: QuizStatus;
  score: number;
  attempts: number;
  passed: boolean;
  lastSubmittedAt?: Date;
}

export interface ISectionProgress {
  sectionId: mongoose.Types.ObjectId;
  title?: string;
  status: TrainingBaseStatus;
  completedAt?: Date;
}

export interface IModuleProgress {
  moduleId: mongoose.Types.ObjectId;
  title?: string;
  status: TrainingBaseStatus;
  sections: ISectionProgress[];
  quizzes: IQuizProgress[];
  progressPercentage: number;
  completedAt?: Date;
}

export interface IUserProgress extends Document {
  repId: mongoose.Types.ObjectId;
  courseId: mongoose.Types.ObjectId;
  journeyId?: mongoose.Types.ObjectId;
  event?: RepTrainingTrackingEventKind | string;
  moduleId?: mongoose.Types.ObjectId;
  slideIndex?: number;
  slides?: Map<string, { completed?: boolean }>;
  durationMs?: number;
  engagementScore?: number;
  status: TrainingBaseStatus;
  modules: IModuleProgress[];
  progressPercentage: number;
  completedModules: number;
  totalModules: number;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const sectionProgressSchema = new Schema<ISectionProgress>(
  {
    sectionId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String },
    status: { type: String, enum: TRAINING_BASE_STATUSES, default: 'pending' },
    completedAt: { type: Date }
  },
  { _id: false }
);

const quizProgressSchema = new Schema<IQuizProgress>(
  {
    quizId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String },
    status: { type: String, enum: QUIZ_STATUSES, default: 'pending' },
    score: { type: Number, min: 0, max: 100, default: 0 },
    attempts: { type: Number, min: 0, default: 0 },
    passed: { type: Boolean, default: false },
    lastSubmittedAt: { type: Date }
  },
  { _id: false }
);

const moduleProgressSchema = new Schema<IModuleProgress>(
  {
    moduleId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String },
    status: { type: String, enum: TRAINING_BASE_STATUSES, default: 'pending' },
    sections: { type: [sectionProgressSchema], default: [] },
    quizzes: { type: [quizProgressSchema], default: [] },
    progressPercentage: { type: Number, min: 0, max: 100, default: 0 },
    completedAt: { type: Date }
  },
  { _id: false }
);

const userProgressSchema = new Schema<IUserProgress>(
  {
    repId: { type: Schema.Types.ObjectId, required: true, index: true },
    courseId: { type: Schema.Types.ObjectId, required: true, index: true, ref: 'TrainingJourney' },
    journeyId: { type: Schema.Types.ObjectId, index: true, ref: 'TrainingJourney' },
    event: { type: String, enum: REP_TRAINING_TRACKING_EVENTS },
    moduleId: { type: Schema.Types.ObjectId },
    slideIndex: { type: Number, min: 0 },
    slides: { type: Map, of: new Schema({ completed: { type: Boolean, default: false } }, { _id: false }) },
    durationMs: { type: Number, min: 0, default: 0 },
    engagementScore: { type: Number, min: 0, max: 100, default: 0 },
    status: { type: String, enum: TRAINING_BASE_STATUSES, default: 'pending' },
    modules: { type: [moduleProgressSchema], default: [] },
    progressPercentage: { type: Number, min: 0, max: 100, default: 0 },
    completedModules: { type: Number, min: 0, default: 0 },
    totalModules: { type: Number, min: 0, default: 0 },
    completedAt: { type: Date }
  },
  {
    timestamps: true,
    collection: 'rep_training_tracking',
    versionKey: false
  }
);

userProgressSchema.index({ repId: 1, courseId: 1 }, { unique: true });
userProgressSchema.index({ repId: 1, journeyId: 1 }, { unique: true, sparse: true });
userProgressSchema.index({ journeyId: 1 });

export default mongoose.model<IUserProgress>('RepTrainingTracking', userProgressSchema);
