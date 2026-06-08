import mongoose, { Schema, Document } from 'mongoose';

/**
 * Modèle léger en lecture seule sur la collection `agents` (profil rep, géré par
 * le service matching). Sert uniquement à récupérer le nom réel de l'agent
 * (ex: pour les certificats) à partir de son `_id` (= repId côté training).
 */
export interface IAgent extends Document {
  personalInfo?: {
    name?: string;
    email?: string;
  };
  companyId?: mongoose.Types.ObjectId;
}

const agentSchema = new Schema<IAgent>(
  {
    personalInfo: {
      name: { type: String },
      email: { type: String }
    },
    companyId: { type: Schema.Types.ObjectId }
  },
  {
    collection: 'agents',
    strict: false
  }
);

export default mongoose.model<IAgent>('Agent', agentSchema);
