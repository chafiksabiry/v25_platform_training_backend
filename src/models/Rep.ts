import mongoose, { Schema, Document } from 'mongoose';

export interface IRep extends Document {
  userId: string;
  name: string;
  email: string;
  role: string;
  department?: string;
  companyId?: string;
  gigId?: string;
  skills?: string[];
  aiPersonalityProfile?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const repSchema = new Schema<IRep>(
  {
    userId: {
      type: String,
      required: true,
      ref: 'User'
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    role: {
      type: String,
      default: 'rep'
    },
    department: {
      type: String,
      trim: true
    },
    companyId: {
      type: String,
      ref: 'Company'
    },
    gigId: {
      type: String,
      ref: 'Gig'
    },
    skills: [{
      type: String,
      trim: true
    }],
    aiPersonalityProfile: {
      type: Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

repSchema.index({ userId: 1 });
repSchema.index({ companyId: 1 });
repSchema.index({ gigId: 1 });

export default mongoose.model<IRep>('Rep', repSchema);
