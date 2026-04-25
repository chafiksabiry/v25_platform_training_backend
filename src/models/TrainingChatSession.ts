import mongoose, { Schema, Document } from 'mongoose';

export interface ITrainingChatMessage {
  role: 'user' | 'assistant';
  text: string;
  createdAt: Date;
}

/** Même forme que `TrainingJourney.modulePlan` (champ racine de la session chat). */
export interface ITrainingChatModulePlanItem {
  title: string;
  objectifs: string[];
  keyTopics: string[];
  durationMinutes?: number;
  isValid?: boolean;
  detailedContentMarkdown?: string;
}

export type ChatBuildStatus = 'pending' | 'in_progress' | 'completed';

export interface ITrainingChatWorkflowModuleStatus {
  index: number;
  title: string;
  status: ChatBuildStatus;
}

export interface ITrainingChatWorkflowStatus {
  plan: ChatBuildStatus;
  modules: ITrainingChatWorkflowModuleStatus[];
  updatedAt?: Date;
}

export interface ITrainingChatSession extends Document {
  gigId?: mongoose.Types.ObjectId | string;
  companyId?: mongoose.Types.ObjectId | string;
  title: string;
  messages: ITrainingChatMessage[];
  contextSnapshot?: Record<string, unknown> | null;
  /** Plan structuré persisté sur le document (collection `training_chat_sessions`). */
  modulePlan?: ITrainingChatModulePlanItem[];
  modulePlanUpdatedAt?: Date;
  planIsValid?: boolean;
  workflowStatus?: ITrainingChatWorkflowStatus;
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

const trainingChatModulePlanItemSchema = new Schema<ITrainingChatModulePlanItem>(
  {
    title: { type: String, required: true, trim: true, maxlength: 600 },
    objectifs: { type: [String], default: [] },
    keyTopics: { type: [String], default: [] },
    durationMinutes: { type: Number, min: 1, max: 10080 },
    isValid: { type: Boolean, default: false },
    detailedContentMarkdown: { type: String, trim: true, maxlength: 250000 },
  },
  { _id: false }
);

const trainingChatWorkflowModuleStatusSchema = new Schema<ITrainingChatWorkflowModuleStatus>(
  {
    index: { type: Number, required: true, min: 0 },
    title: { type: String, required: true, trim: true, maxlength: 600 },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
    },
  },
  { _id: false }
);

const trainingChatWorkflowStatusSchema = new Schema<ITrainingChatWorkflowStatus>(
  {
    plan: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
    },
    modules: {
      type: [trainingChatWorkflowModuleStatusSchema],
      default: [],
    },
    updatedAt: {
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
    contextSnapshot: {
      type: Schema.Types.Mixed,
      default: null,
    },
    modulePlan: {
      type: [trainingChatModulePlanItemSchema],
      default: undefined,
    },
    modulePlanUpdatedAt: {
      type: Date,
      default: undefined,
    },
    planIsValid: {
      type: Boolean,
      default: false,
    },
    workflowStatus: {
      type: trainingChatWorkflowStatusSchema,
      default: () => ({ plan: 'pending', modules: [], updatedAt: new Date() }),
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
