import mongoose, { Schema, Document } from 'mongoose';

export interface ITrainingPodcastChatMessage {
  role: 'user' | 'assistant';
  text: string;
  createdAt: Date;
}

export interface ITrainingPodcast extends Document {
  gigId?: mongoose.Types.ObjectId | string;
  companyId?: mongoose.Types.ObjectId | string;
  title: string;
  trainingTitle?: string;
  language: string;
  script: string;
  scriptCloudinaryUrl?: string;
  scriptCloudinaryPublicId?: string;
  audioUrl?: string;
  audioCloudinaryPublicId?: string;
  chatMessages: ITrainingPodcastChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

const podcastChatMessageSchema = new Schema<ITrainingPodcastChatMessage>(
  {
    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50000,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const trainingPodcastSchema = new Schema<ITrainingPodcast>(
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
    language: {
      type: String,
      default: 'fr',
      trim: true,
      maxlength: 12,
    },
    script: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300000,
    },
    scriptCloudinaryUrl: { type: String, trim: true },
    scriptCloudinaryPublicId: { type: String, trim: true },
    audioUrl: { type: String, trim: true },
    audioCloudinaryPublicId: { type: String, trim: true },
    chatMessages: {
      type: [podcastChatMessageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'training_podcasts',
  }
);

trainingPodcastSchema.index({ gigId: 1, createdAt: -1 });
trainingPodcastSchema.index({ companyId: 1, createdAt: -1 });

export default mongoose.model<ITrainingPodcast>('TrainingPodcast', trainingPodcastSchema);

