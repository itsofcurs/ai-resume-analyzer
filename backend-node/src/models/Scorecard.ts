import mongoose, { Document, Schema } from 'mongoose';

export interface IScorecard extends Document {
  candidateId: string;
  interviewerId: string;
  organizationId: string;
  technicalScore: number;
  behavioralScore: number;
  communicationScore: number;
  confidenceScore: number;
  overallScore: number;
  notes: string;
  recommendation: 'Strong Hire' | 'Hire' | 'Hold' | 'Reject';
  createdAt: Date;
  updatedAt: Date;
}

const ScorecardSchema: Schema = new Schema({
  candidateId: { type: String, required: true, index: true },
  interviewerId: { type: String, required: true, index: true },
  organizationId: { type: String, required: true, index: true },
  
  technicalScore: { type: Number, required: true, min: 0, max: 100 },
  behavioralScore: { type: Number, required: true, min: 0, max: 100 },
  communicationScore: { type: Number, required: true, min: 0, max: 100 },
  confidenceScore: { type: Number, required: true, min: 0, max: 100 },
  overallScore: { type: Number, required: true, min: 0, max: 100 },
  
  notes: { type: String, default: '' },
  recommendation: { 
    type: String, 
    required: true, 
    enum: ['Strong Hire', 'Hire', 'Hold', 'Reject'] 
  }
}, {
  timestamps: true
});

export const Scorecard = mongoose.model<IScorecard>('Scorecard', ScorecardSchema);
