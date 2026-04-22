import mongoose, { Document, Schema } from 'mongoose';

export interface IStructuredSlideBlock {
  type: 'paragraph' | 'bullets' | 'kpi' | 'quote' | 'table' | 'stat' | 'image_prompt';
  title?: string;
  text?: string;
  items?: string[];
  value?: string;
  label?: string;
  headers?: string[];
  rows?: string[][];
  source?: string;
}

export interface IStructuredSlide {
  index: number;
  kind: 'cover' | 'agenda' | 'content' | 'conclusion';
  layout?: 'standard' | 'split' | 'highlight' | 'timeline';
  title: string;
  bullets: string[];
  notes?: string;
  blocks?: IStructuredSlideBlock[];
}

export interface IStructuredTheme {
  template?: 'corporate' | 'dark' | 'minimal' | 'learning' | 'executive';
  accentColor?: string;
  backgroundStyle?: 'light' | 'gradient' | 'dark';
  coverImageUrl?: string;
  coverImagePrompt?: string;
}

export interface IStructuredTrainingSlides extends Document {
  gigId?: mongoose.Types.ObjectId | string;
  companyId?: mongoose.Types.ObjectId | string;
  trainingJourneyId?: mongoose.Types.ObjectId | string;
  title: string;
  language: string;
  theme?: IStructuredTheme;
  slides: IStructuredSlide[];
  createdAt: Date;
  updatedAt: Date;
}

const structuredTrainingSlidesSchema = new Schema<IStructuredTrainingSlides>(
  {
    gigId: { type: Schema.Types.ObjectId, ref: 'Gig', index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    trainingJourneyId: { type: Schema.Types.ObjectId, ref: 'TrainingJourney', index: true },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    language: { type: String, default: 'fr', trim: true, maxlength: 12 },
    theme: { type: Schema.Types.Mixed },
    slides: {
      type: [Schema.Types.Mixed],
      default: [],
      validate: {
        validator: (arr: any[]) => Array.isArray(arr) && arr.length >= 0 && arr.length <= 40,
        message: 'Structured slides must contain between 0 and 40 slides.',
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'structured_training_slides',
  }
);

structuredTrainingSlidesSchema.index({ gigId: 1, createdAt: -1 });
structuredTrainingSlidesSchema.index({ companyId: 1, createdAt: -1 });

export default mongoose.model<IStructuredTrainingSlides>('StructuredTrainingSlides', structuredTrainingSlidesSchema);

