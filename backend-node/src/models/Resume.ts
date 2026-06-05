import mongoose, { Schema, Document } from 'mongoose';

export interface IResume extends Document {
  filename: string;
  cloudinaryUrl?: string;
  candidateName?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  rawText: string;
  status: 'PENDING' | 'EXTRACTING' | 'ANALYZING' | 'SCORING' | 'RANKING' | 'PROCESSED' | 'FAILED';
  parsedData?: any; // The lightweight NLP extraction
  aiAnalysis?: any; // The Gemini/LLM reasoning output
  embeddingsId?: string; // Reference to Vector DB ID
  atsScores?: any; // Standalone ATS scoring breakdown
  candidateRanking?: any; // Candidate grade/tier/recommendation
  recommendationScore?: number;
  recommendationReason?: string;
  lastMatchedJob?: string;
  semanticScore?: number;
  comparisonHistory?: any[]; // Array of past comparisons
  interviewQuestions?: any; // Generated interview questions
  interviewEvaluation?: any; // AI evaluation of candidate answers
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
      enum: ['PENDING', 'EXTRACTING', 'ANALYZING', 'SCORING', 'RANKING', 'PROCESSED', 'FAILED'],
      default: 'PENDING',
    },
    parsedData: { type: Schema.Types.Mixed },
    aiAnalysis: { type: Schema.Types.Mixed },
    embeddingsId: { type: String },
    atsScores: { type: Schema.Types.Mixed },
    candidateRanking: { type: Schema.Types.Mixed },
    recommendationScore: { type: Number },
    recommendationReason: { type: String },
    lastMatchedJob: { type: String },
    semanticScore: { type: Number },
    comparisonHistory: [{ type: Schema.Types.Mixed }],
    interviewQuestions: { type: Schema.Types.Mixed },
    interviewEvaluation: { type: Schema.Types.Mixed },
    uploadedBy: { type: String, required: true }, // Postgres User ID
    organizationId: { type: String, required: true }, // Postgres Organization ID
  },
  {
    timestamps: true,
  }
);

export const Resume = mongoose.model<IResume>('Resume', ResumeSchema);
