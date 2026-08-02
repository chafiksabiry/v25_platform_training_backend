import mongoose, { Schema, Document } from 'mongoose';

export interface ITrainingImageItem {
  index: number;
  title: string;
  prompt: string;
  imageUrl: string;
  imageCloudinaryPublicId?: string;
}

export interface ITrainingImageSet extends Document {
  gigId?: mongoose.Types.ObjectId | string;
  companyId?: mongoose.Types.ObjectId | string;
  title: string;
  trainingTitle?: string;
  renderMode?: 'ai_images' | 'template_slides';
  language: string;
  sourceDigest?: string;
  items: ITrainingImageItem[];
  createdAt: Date;
  updatedAt: Date;
}

const trainingImageItemSchema = new Schema<ITrainingImageItem>(
  {
    index: { type: Number, required: true, min: 1, max: 20 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    prompt: { type: String, required: true, trim: true, maxlength: 1200 },
    imageUrl: { type: String, required: true, trim: true },
    imageCloudinaryPublicId: { type: String, trim: true },
  },
  { _id: false }
);

const trainingImageSetSchema = new Schema<ITrainingImageSet>(
  {
    gigId: {
      type: Schema.Types.ObjectId,
      ref: 'Gig',
      index: true,
    },
    companyId: {
      type: Schema.Types.ObjectId,
      ref: 'Company',
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    trainingTitle: { type: String, trim: true, maxlength: 280 },
    renderMode: { type: String, enum: ['ai_images', 'template_slides'], default: 'ai_images' },
    language: { type: String, default: 'fr', trim: true, maxlength: 12 },
    sourceDigest: { type: String, trim: true, maxlength: 40000 },
    items: {
      type: [trainingImageItemSchema],
      default: [],
      validate: {
        // Allow empty set at creation time; items are appended progressively by background job.
        validator: (arr: ITrainingImageItem[]) => Array.isArray(arr) && arr.length >= 0 && arr.length <= 20,
        message: 'Image set must contain between 0 and 20 items.',
      },
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'training_image_sets',
  }
);

trainingImageSetSchema.index({ gigId: 1, createdAt: -1 });
trainingImageSetSchema.index({ companyId: 1, createdAt: -1 });

export default mongoose.model<ITrainingImageSet>('TrainingImageSet', trainingImageSetSchema);

