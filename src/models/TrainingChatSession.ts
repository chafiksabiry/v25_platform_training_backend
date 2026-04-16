import mongoose, { Schema, Document } from 'mongoose';

export interface ITrainingChatMessage {
  role: 'user' | 'assistant';
  text: string;
  createdAt: Date;
}

export interface ITrainingChatSession extends Document {
  gigId?: mongoose.Types.ObjectId | string;
  companyId?: mongoose.Types.ObjectId | string;
  title: string;
  messages: ITrainingChatMessage[];
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const trainingChatMessageSchema = new Schema<ITrainingChatMessage>(
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

const trainingChatSessionSchema = new Schema<ITrainingChatSession>(
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
      default: 'Nouvelle conversation',
    },
    messages: {
      type: [trainingChatMessageSchema],
      default: [],
    },
    lastActivityAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'training_chat_sessions',
  }
);

trainingChatSessionSchema.index({ gigId: 1, lastActivityAt: -1 });
trainingChatSessionSchema.index({ companyId: 1, lastActivityAt: -1 });

export default mongoose.model<ITrainingChatSession>('TrainingChatSession', trainingChatSessionSchema);
