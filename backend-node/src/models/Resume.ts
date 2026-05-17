import mongoose, { Schema, Document } from 'mongoose';

export interface IResume extends Document {
  filename: string;
  cloudinaryUrl?: string;
  candidateName?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  rawText: string;
  status: 'PENDING' | 'EXTRACTING' | 'ANALYZING' | 'PROCESSED' | 'FAILED';
  parsedData?: any; // The lightweight NLP extraction
  aiAnalysis?: any; // The Gemini/LLM reasoning output
  embeddingsId?: string; // Reference to Vector DB ID
  uploadedBy: string; // Recruiter/User ID from Postgres
  organizationId: string; // Organization ID from Postgres
  createdAt: Date;
  updatedAt: Date;
}

const ResumeSchema: Schema = new Schema(
  {
    filename: { type: String, required: true },
    cloudinaryUrl: { type: String },
    candidateName: { type: String },
    candidateEmail: { type: String },
    candidatePhone: { type: String },
    rawText: { type: String, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'EXTRACTING', 'ANALYZING', 'PROCESSED', 'FAILED'],
      default: 'PENDING',
    },
    parsedData: { type: Schema.Types.Mixed },
    aiAnalysis: { type: Schema.Types.Mixed },
    embeddingsId: { type: String },
    uploadedBy: { type: String, required: true }, // Postgres User ID
    organizationId: { type: String, required: true }, // Postgres Organization ID
  },
  {
    timestamps: true,
  }
);

export const Resume = mongoose.model<IResume>('Resume', ResumeSchema);
