import mongoose, { Schema, Document } from 'mongoose';

export interface IQuizQuestion {
  _id?: string;
  question: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
}

export interface IQuiz {
  _id?: string;
  title: string;
  description?: string;
  questions: IQuizQuestion[];
  passingScore: number;
  duration?: number;
}

export interface ISection {
  _id?: string;
  title: string;
  content: string;
  type: string;
  duration?: number;
  resources?: Array<{
    title: string;
    url: string;
    type: string;
  }>;
}

export interface ITrainingModule {
  _id?: string;
  title: string;
  description?: string;
  duration?: number;
  difficulty?: string;
  learningObjectives?: string[];
  prerequisites?: string[];
  topics?: string[];
  sections: ISection[];
  quizzes: IQuiz[];
  order?: number;
}

export interface IFinalExam {
  _id?: string;
  title: string;
  description?: string;
  questions: IQuizQuestion[];
  passingScore: number;
  duration?: number;
}

export interface ITrainingJourney extends Document {
  companyId?: string;
  gigId?: string;
  industry?: string;
  presentationUrl?: string;
  name: string;
  title: string;
  description?: string;
  status: string;
  estimatedDuration?: string;
  targetRoles?: string[];
  methodologyData?: Record<string, any>;
  modules: ITrainingModule[];
  finalExam?: IFinalExam;
  enrolledRepIds?: string[];
  launchDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const quizQuestionSchema = new Schema<IQuizQuestion>(
  {
    _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    question: { type: String, required: true },
    options: [{ type: String, required: true }],
    correctAnswer: { type: Number, required: true },
    explanation: { type: String }
  },
  { _id: false }
);

const quizSchema = new Schema<IQuiz>(
  {
    _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    title: { type: String, required: true },
    description: { type: String },
    questions: [quizQuestionSchema],
    passingScore: { type: Number, default: 70 },
    duration: { type: Number }
  },
  { _id: false }
);

const sectionSchema = new Schema<ISection>(
  {
    _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    title: { type: String, required: true },
    content: { type: String, required: true },
    type: { type: String, default: 'text' },
    duration: { type: Number },
    resources: [{
      title: { type: String },
      url: { type: String },
      type: { type: String }
    }]
  },
  { _id: false }
);

const trainingModuleSchema = new Schema<ITrainingModule>(
  {
    _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    title: { type: String, required: true },
    description: { type: String },
    duration: { type: Number },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner'
    },
    learningObjectives: [{ type: String }],
    prerequisites: [{ type: String }],
    topics: [{ type: String }],
    sections: [sectionSchema],
    quizzes: [quizSchema],
    order: { type: Number }
  },
  { _id: false }
);

const finalExamSchema = new Schema<IFinalExam>(
  {
    _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    title: { type: String, required: true },
    description: { type: String },
    questions: [quizQuestionSchema],
    passingScore: { type: Number, default: 70 },
    duration: { type: Number }
  },
  { _id: false }
);

const trainingJourneySchema = new Schema<ITrainingJourney>(
  {
    companyId: {
      type: String,
      ref: 'Company'
    },
    gigId: {
      type: String,
      ref: 'Gig'
    },
    industry: {
      type: String,
      trim: true
    },
    presentationUrl: {
      type: String
    },
    name: {
      type: String,
      required: [true, 'Journey name is required'],
      minlength: [2, 'Journey name must be at least 2 characters'],
      maxlength: [200, 'Journey name cannot exceed 200 characters'],
      trim: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      default: 'draft',
      enum: ['draft', 'rehearsal', 'active', 'completed', 'archived']
    },
    estimatedDuration: {
      type: String
    },
    targetRoles: [{
      type: String,
      trim: true
    }],
    methodologyData: {
      type: Schema.Types.Mixed,
      default: {}
    },
    modules: [trainingModuleSchema],
    finalExam: finalExamSchema,
    enrolledRepIds: [{
      type: String,
      ref: 'Rep'
    }],
    launchDate: {
      type: Date
    }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'training_journeys'
  }
);

trainingJourneySchema.index({ companyId: 1 });
trainingJourneySchema.index({ gigId: 1 });
trainingJourneySchema.index({ status: 1 });
trainingJourneySchema.index({ industry: 1 });

export default mongoose.model<ITrainingJourney>('TrainingJourney', trainingJourneySchema);
