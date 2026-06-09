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
  fraudAnalysis?: any; // Phase 2C-B: Trust Score and Fraud Metrics
  skillGapAnalysis?: any; // Phase 2C-C: Skill Gap Intelligence
  predictiveHiring?: any; // Phase 2C-D: Predictive Hiring Intelligence
  successPrediction?: any; // Phase 2E-A: Candidate Success Prediction
  answerAuthenticity?: any; // Phase 2F-B: Interview Answer Authenticity
  skillGraph?: {
    technicalSkills: Array<{ skill: string; score: number; confidence: number; evidenceCount: number }>;
    softSkills: Array<{ skill: string; score: number; confidence: number; evidenceCount: number }>;
    strengths: string[];
    weaknesses: string[];
    skillClusters?: Array<{ clusterName: string; skills: string[]; score: number }>;
    skillRelationships?: Array<{ source: string; target: string; relationship: string; confidence: number }>;
    competencyLevel?: {
      technical: string;
      communication: string;
      leadership: string;
      problemSolving: string;
    };
    overallTechnicalScore: number;
    overallSoftSkillScore: number;
    generatedAt: Date;
  }; // Phase 3B: Competency Intelligence
  knowledgeGraph?: {
    candidateCluster: string;
    graphScore: number;
    similarCandidates: Array<{
      resumeId: string;
      similarityScore: number;
    }>;
    connectedSkills: Array<{
      skill: string;
      weight: number;
    }>;
    relatedProjects: Array<{
      project: string;
      relevance: number;
    }>;
    inferredStrengths: string[];
    hiddenTalents: string[];
    generatedAt: Date;
  };
  voiceVideoAnalysis?: Array<{
    roundType: string;
    analysisStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    transcriptVersion?: string;
    transcriptionStatus?: 'PENDING' | 'COMPLETED' | 'FAILED';
    communicationScore: number;
    confidenceScore: number;
    clarityScore: number;
    professionalismScore: number;
    leadershipPresenceScore: number;
    engagementScore: number;
    speechRate: number;
    fillerWordCount: number;
    pauseFrequency: number;
    eyeContactScore: number;
    headStabilityScore: number;
    faceVisibilityScore: number;
    cameraPresenceScore: number;
    attentionScore: number;
    sentimentScore: number;
    authenticityScore: number;
    interviewIntegrityScore: number;
    scriptReadingRisk: string;
    aiGeneratedAnswerRisk: string;
    suspiciousBehaviorFlags: string[];
    transcript: string;
    strengths: string[];
    weaknesses: string[];
    behavioralIndicators: string[];
    executiveSummary: string;
    analyzedAt: Date;
  }>;
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
    fraudAnalysis: { type: Schema.Types.Mixed }, // Phase 2C-B
    skillGapAnalysis: { type: Schema.Types.Mixed }, // Phase 2C-C
    predictiveHiring: { type: Schema.Types.Mixed }, // Phase 2C-D
    successPrediction: { type: Schema.Types.Mixed }, // Phase 2E-A
    answerAuthenticity: { type: Schema.Types.Mixed }, // Phase 2F-B
    skillGraph: { type: Schema.Types.Mixed }, // Phase 3B
    knowledgeGraph: { type: Schema.Types.Mixed }, // Phase 3C
    voiceVideoAnalysis: [{ type: Schema.Types.Mixed }], // Phase 3E
    uploadedBy: { type: String, required: true }, // Postgres User ID
    organizationId: { type: String, required: true }, // Postgres Organization ID
  },
  {
    timestamps: true,
  }
);

ResumeSchema.index({ organizationId: 1, status: 1 });
ResumeSchema.index({ organizationId: 1, createdAt: -1 });
ResumeSchema.index({ organizationId: 1, "voiceVideoAnalysis.analysisStatus": 1 });
ResumeSchema.index({ organizationId: 1, "voiceVideoAnalysis.analyzedAt": -1 });
ResumeSchema.index({ organizationId: 1, "skillGraph.technicalSkills.skill": 1 });
ResumeSchema.index({ organizationId: 1, "skillGraph.softSkills.skill": 1 });
ResumeSchema.index({ organizationId: 1, "skillGraph.generatedAt": -1 });
ResumeSchema.index({ organizationId: 1, "skillGraph.overallTechnicalScore": -1 });
ResumeSchema.index({ organizationId: 1, "skillGraph.competencyLevel.technical": 1 });
ResumeSchema.index({ organizationId: 1, "knowledgeGraph.candidateCluster": 1 });
ResumeSchema.index({ organizationId: 1, "knowledgeGraph.graphScore": -1 });
ResumeSchema.index({ organizationId: 1, "knowledgeGraph.hiddenTalents": 1 });
ResumeSchema.index({ organizationId: 1, "knowledgeGraph.similarCandidates.resumeId": 1 });

export const Resume = mongoose.model<IResume>('Resume', ResumeSchema);
