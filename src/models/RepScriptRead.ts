import mongoose, { Document, Schema } from 'mongoose';

/**
 * Persists that a REP has read the call script for a given gig (and optional journey).
 * Keyed primarily by repId + gigId so status survives devices / browsers (no localStorage).
 */
export interface IRepScriptRead extends Document {
  repId: mongoose.Types.ObjectId;
  gigId: mongoose.Types.ObjectId;
  journeyId?: mongoose.Types.ObjectId;
  scriptId?: string;
  readAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const repScriptReadSchema = new Schema<IRepScriptRead>(
  {
    repId: { type: Schema.Types.ObjectId, required: true, index: true },
    gigId: { type: Schema.Types.ObjectId, required: true, index: true },
    journeyId: { type: Schema.Types.ObjectId, required: false, index: true },
    scriptId: { type: String, required: false },
    readAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true, collection: 'rep_script_reads' }
);

repScriptReadSchema.index({ repId: 1, gigId: 1 }, { unique: true });
repScriptReadSchema.index({ repId: 1, journeyId: 1 }, { sparse: true });

export const RepScriptRead = mongoose.model<IRepScriptRead>('RepScriptRead', repScriptReadSchema);
export default RepScriptRead;
