import mongoose, { Schema, Document } from 'mongoose';

export type RepNotificationKind = 'enrollment' | 'script_required' | 'certification_required' | 'general';

export interface IRepNotification extends Document {
  repId: mongoose.Types.ObjectId;
  notificationKey: string;
  kind: RepNotificationKind;
  status?: string;
  gigId?: mongoose.Types.ObjectId;
  journeyId?: mongoose.Types.ObjectId;
  title: string;
  message: string;
  actionPath?: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const repNotificationSchema = new Schema<IRepNotification>(
  {
    repId: { type: Schema.Types.ObjectId, required: true, index: true },
    notificationKey: { type: String, required: true, trim: true },
    kind: {
      type: String,
      enum: ['enrollment', 'script_required', 'certification_required', 'general'],
      default: 'general',
    },
    status: { type: String, trim: true },
    gigId: { type: Schema.Types.ObjectId },
    journeyId: { type: Schema.Types.ObjectId },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    actionPath: { type: String, trim: true },
    read: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: 'rep_notifications',
  }
);

repNotificationSchema.index({ repId: 1, notificationKey: 1 }, { unique: true });

export default (mongoose.models.RepNotification as mongoose.Model<IRepNotification>) ||
  mongoose.model<IRepNotification>('RepNotification', repNotificationSchema);
