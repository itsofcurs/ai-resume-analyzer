import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
  recipientId: string; // Recruiter/User ID
  organizationId: string;
  type: 'ASSIGNED' | 'INTERVIEW_SCHEDULED' | 'OFFER_SENT' | 'STUCK_CANDIDATE';
  message: string;
  read: boolean;
  relatedEntityId?: string; // e.g. Resume ID or Interview ID
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema(
  {
    recipientId: { type: String, required: true },
    organizationId: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['ASSIGNED', 'INTERVIEW_SCHEDULED', 'OFFER_SENT', 'STUCK_CANDIDATE'],
      required: true
    },
    message: { type: String, required: true },
    read: { type: Boolean, default: false },
    relatedEntityId: { type: String },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({ organizationId: 1, recipientId: 1, read: 1 });
NotificationSchema.index({ organizationId: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
