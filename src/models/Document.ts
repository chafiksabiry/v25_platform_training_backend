import mongoose, { Schema, Document } from 'mongoose';

export interface IDocument extends Document {
  name: string;
  description?: string;
  fileUrl: string;
  cloudinaryPublicId?: string;
  fileType: string;
  content: string;
  tags: string[];
  uploadedBy: string;
  companyId: mongoose.Types.ObjectId;
  gigId?: mongoose.Types.ObjectId;
  isProcessed: boolean;
  processingStatus: string;
  chunks: Array<{
    content: string;
    index: number;
  }>;
  analysis?: {
    summary: string;
    domain: string;
    theme: string;
    mainPoints: string[];
    technicalLevel: string;
    targetAudience: string;
    keyTerms: string[];
    recommendations: string[];
  };
  metadata: {
    wordCount: number;
    characterCount: number;
    sentenceCount: number;
    paragraphCount: number;
    createdAt: Date;
    modifiedAt: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const documentSchema = new Schema<IDocument>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    fileUrl: { type: String, required: true },
    cloudinaryPublicId: { type: String },
    fileType: { type: String, required: true },
    content: { type: String, default: '' },
    tags: { type: [String], default: [] },
    uploadedBy: { type: String },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    gigId: { type: Schema.Types.ObjectId, ref: 'Gig' },
    isProcessed: { type: Boolean, default: false },
    processingStatus: { type: String, default: 'pending' },
    chunks: [
      {
        content: { type: String },
        index: { type: Number }
      }
    ],
    analysis: {
      summary: { type: String },
      domain: { type: String },
      theme: { type: String },
      mainPoints: { type: [String] },
      technicalLevel: { type: String },
      targetAudience: { type: String },
      keyTerms: { type: [String] },
      recommendations: { type: [String] }
    },
    metadata: {
      wordCount: { type: Number },
      characterCount: { type: Number },
      sentenceCount: { type: Number },
      paragraphCount: { type: Number },
      createdAt: { type: Date, default: Date.now },
      modifiedAt: { type: Date, default: Date.now }
    }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'documents' // Explicitly map to the 'documents' collection
  }
);

documentSchema.index({ companyId: 1 });
documentSchema.index({ gigId: 1 });
documentSchema.index({ name: 'text', content: 'text' });

export default mongoose.model<IDocument>('Document', documentSchema);
