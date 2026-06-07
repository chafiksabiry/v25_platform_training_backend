import mongoose, { Schema, Document } from 'mongoose';

export type CertificationStatus = 'certified' | 'revoked';

export interface ICertification extends Document {
  /** Identifiant public stable et lisible du certificat (ex: CERT-1A2B3C4). */
  certificateId: string;
  repId: mongoose.Types.ObjectId;
  journeyId: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  gigId?: mongoose.Types.ObjectId;
  /** Snapshots dénormalisés pour affichage rapide / impression du certificat. */
  traineeName: string;
  trainingTitle: string;
  level: string;
  finalScore?: number;
  status: CertificationStatus;
  issuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const certificationSchema = new Schema<ICertification>(
  {
    certificateId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    repId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'Rep',
      index: true
    },
    journeyId: {
      type: Schema.Types.ObjectId,
      required: true,
      ref: 'TrainingJourney',
      index: true
    },
    companyId: {
      type: Schema.Types.ObjectId,
      index: true,
      sparse: true
    },
    gigId: {
      type: Schema.Types.ObjectId,
      index: true,
      sparse: true
    },
    traineeName: {
      type: String,
      default: 'Trainee',
      trim: true
    },
    trainingTitle: {
      type: String,
      default: 'Training',
      trim: true
    },
    level: {
      type: String,
      default: 'Expert',
      trim: true
    },
    finalScore: {
      type: Number,
      min: 0,
      max: 100
    },
    status: {
      type: String,
      enum: ['certified', 'revoked'],
      default: 'certified'
    },
    issuedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: 'certifications'
  }
);

// Un seul certificat par (rep, formation).
certificationSchema.index({ repId: 1, journeyId: 1 }, { unique: true });

export default mongoose.model<ICertification>('Certification', certificationSchema);
