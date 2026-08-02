import mongoose, { Schema, Document } from 'mongoose';

export interface ITrainingVideo extends Document {
  gigId?: mongoose.Types.ObjectId | string;
  companyId?: mongoose.Types.ObjectId | string;
  title: string;
  trainingTitle?: string;
  prompt: string;
  provider: string;
  modelName: string;
  status: 'generated' | 'saved' | 'failed';
  videoUrl?: string;
  videoCloudinaryPublicId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const trainingVideoSchema = new Schema<ITrainingVideo>(
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
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 240,
    },
    trainingTitle: {
      type: String,
      trim: true,
      maxlength: 280,
    },
    prompt: {
      type: String,
      required: true,
      trim: true,
      maxlength: 12000,
    },
    provider: {
      type: String,
      default: 'veo',
      trim: true,
      maxlength: 40,
    },
    modelName: {
      type: String,
      default: 'veo-2.0-generate-001',
      trim: true,
      maxlength: 80,
    },
    status: {
      type: String,
      enum: ['generated', 'saved', 'failed'],
      default: 'generated',
    },
    videoUrl: { type: String, trim: true },
    videoCloudinaryPublicId: { type: String, trim: true },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'training_videos',
  }
);

trainingVideoSchema.index({ gigId: 1, createdAt: -1 });
trainingVideoSchema.index({ companyId: 1, createdAt: -1 });

export default mongoose.model<ITrainingVideo>('TrainingVideo', trainingVideoSchema);

