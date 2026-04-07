import mongoose, { Schema, Document } from 'mongoose';

export interface IGig extends Document {
  title: string;
  description?: string;
  companyId?: string;
  industry?: string;
  status?: string;
  createdAt: Date;
  updatedAt: Date;
}

const gigSchema = new Schema<IGig>(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    companyId: {
      type: String,
      ref: 'Company'
    },
    industry: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      default: 'active',
      enum: ['active', 'inactive', 'completed']
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

gigSchema.index({ companyId: 1 });
gigSchema.index({ industry: 1 });

export default mongoose.model<IGig>('Gig', gigSchema);
