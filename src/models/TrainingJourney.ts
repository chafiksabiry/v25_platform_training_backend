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
  imageDescription?: string;
  imageUrl?: string;
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
  imageDescription?: string;
  imageUrl?: string;
}

export interface IFinalExam {
  _id?: string;
  title: string;
  description?: string;
  questions: IQuizQuestion[];
  passingScore: number;
  duration?: number;
}

/** Géométries décoratives générées par l’IA (coordonnées en % de la slide 0–100). */
export interface ISlideVisualElement {
  type: 'rectangle' | 'rounded-rectangle' | 'circle' | 'ellipse' | 'triangle' | 'line' | 'arrow';
  /** Coin supérieur gauche ou centre (selon type), % depuis la gauche */
  x?: number;
  /** % depuis le haut */
  y?: number;
  /** Largeur en % de la slide */
  w?: number;
  /** Hauteur en % de la slide */
  h?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  /** 0 = transparent, 1 = opaque */
  opacity?: number;
  rotation?: number;
  label?: string;
}

export interface ISlide {
  id: number;
  type: string;
  title: string;
  subtitle?: string;
  content?: string;
  bullets?: string[];
  note?: string;
  icon?: string;
  highlight?: string;
  /** Prompt / description pour une image illustrative (aucun binaire ici) */
  imageDescription?: string;
  /** Si une URL d’image existe (upload ou service externe), affichage direct */
  illustrationUrl?: string;
  /** Formes décoratives (rectangles, cercles, flèches, etc.) */
  visualElements?: ISlideVisualElement[];
  visualConfig?: {
    layout?: string;
    theme?: string;
    accent?: string;
    backgroundHex?: string;
    textHex?: string;
    accentHex?: string;
  };
}

export interface IPresentation {
  title: string;
  totalSlides: number;
  slides: ISlide[];
  theme?: {
    primary?: string;
    accent?: string;
    style?: string;
  };
  visualTheme?: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
    layoutStyle?: 'modern' | 'corporate' | 'creative';
  };
  estimatedTime?: string;
}

export interface ITrainingJourney extends Document {
  companyId?: string | mongoose.Types.ObjectId;
  gigId?: string | mongoose.Types.ObjectId;
  industry?: string | mongoose.Types.ObjectId;
  presentationUrl?: string;
  filetraining?: string;
  presentation?: IPresentation;
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
  visualTheme?: {
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
    fontFamily?: string;
    layoutStyle?: 'modern' | 'corporate' | 'creative';
  };
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
    imageDescription: { type: String },
    imageUrl: { type: String },
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
    order: { type: Number },
    imageDescription: { type: String },
    imageUrl: { type: String }
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
      type: Schema.Types.ObjectId,
      ref: 'Company'
    },
    gigId: {
      type: Schema.Types.ObjectId,
      ref: 'Gig'
    },
    industry: {
      type: Schema.Types.ObjectId,
      ref: 'Industry'
    },
    presentationUrl: {
      type: String
    },
    filetraining: {
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
    },
    // Store entire AI-generated presentation as-is (Mixed allows any structure)
    presentation: {
      type: Schema.Types.Mixed
    },
    visualTheme: {
      primaryColor: { type: String },
      secondaryColor: { type: String },
      accentColor: { type: String },
      fontFamily: { type: String },
      layoutStyle: { type: String, enum: ['modern', 'corporate', 'creative'] }
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
