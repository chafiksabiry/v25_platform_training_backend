import mongoose, { Schema, Document } from 'mongoose';

export interface IIndustry extends Document {
  name: string;
  description?: string;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
}

const industrySchema = new Schema<IIndustry>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    icon: {
      type: String
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export default mongoose.model<IIndustry>('Industry', industrySchema);
