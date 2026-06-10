import mongoose, { Schema, Document } from 'mongoose';

export interface IInterview extends Document {
  candidateId: mongoose.Types.ObjectId;
  organizationId: string;
  recruiterId: string; // User ID from Postgres
  interviewerName: string;
  date: Date;
  meetingLink?: string;
  status: 'Scheduled' | 'Completed' | 'Cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const InterviewSchema: Schema = new Schema(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: 'Resume', required: true },
    organizationId: { type: String, required: true },
    recruiterId: { type: String, required: true },
    interviewerName: { type: String, required: true },
    date: { type: Date, required: true },
    meetingLink: { type: String },
    status: {
      type: String,
      enum: ['Scheduled', 'Completed', 'Cancelled'],
      default: 'Scheduled',
    },
  },
  {
    timestamps: true,
  }
);

InterviewSchema.index({ organizationId: 1, candidateId: 1 });
InterviewSchema.index({ organizationId: 1, date: 1 });
InterviewSchema.index({ organizationId: 1, status: 1 });

export const Interview = mongoose.model<IInterview>('Interview', InterviewSchema);
