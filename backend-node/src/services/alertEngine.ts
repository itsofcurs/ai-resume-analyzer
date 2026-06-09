import { io } from '../server';

export interface AlertPayload {
  type: 'FRAUD_RISK' | 'RETENTION_RISK' | 'INTERVIEW_DROP' | 'ATS_DECLINE' | 'AI_GENERATED' | 'PLAGIARISM' | 'LOW_AUTHENTICITY';
  severity: 'high' | 'medium' | 'low';
  message: string;
  candidateId?: string;
  organizationId: string;
}

export const emitAlert = (alert: AlertPayload) => {
  // Emit to all connected clients. In a real app, we'd scope this by organizationId using socket rooms.
  io.emit('PROACTIVE_ALERT', alert);
};

export const evaluateCandidateAlerts = (candidate: any) => {
  if (!candidate || !candidate.organizationId) return;

  const orgId = candidate.organizationId;
  const cId = candidate._id || candidate.id;
  const name = candidate.parsedData?.personalInfo?.name || 'A candidate';

  // Check Fraud Risk
  if (candidate.fraudAnalysis?.fraudRisk === 'HIGH') {
    emitAlert({
      type: 'FRAUD_RISK',
      severity: 'high',
      message: `HIGH FRAUD RISK DETECTED for ${name}`,
      candidateId: cId,
      organizationId: orgId
    });
  }

  // Check Retention Risk
  if (candidate.successPrediction?.retentionRisk === 'HIGH' || candidate.predictiveHiring?.retentionRisk === 'HIGH') {
    emitAlert({
      type: 'RETENTION_RISK',
      severity: 'high',
      message: `TOP CANDIDATE RETENTION RISK for ${name}`,
      candidateId: cId,
      organizationId: orgId
    });
  }

  // Check ATS Score Drop (if ATS is below 50, alert)
  if (candidate.atsScores?.overall_score < 50) {
    emitAlert({
      type: 'ATS_DECLINE',
      severity: 'medium',
      message: `ATS QUALITY DECLINING for ${name} (Score: ${candidate.atsScores.overall_score})`,
      candidateId: cId,
      organizationId: orgId
    });
  }

  // Check Interview Score
  if (candidate.interviewEvaluation?.overallScore && candidate.interviewEvaluation.overallScore < 60) {
    emitAlert({
      type: 'INTERVIEW_DROP',
      severity: 'medium',
      message: `INTERVIEW SCORE DROPPING for ${name}`,
      candidateId: cId,
      organizationId: orgId
    });
  }

  // Check Authenticity
  if (candidate.answerAuthenticity) {
    if (candidate.answerAuthenticity.aiGeneratedProbability >= 80) {
      emitAlert({
        type: 'AI_GENERATED',
        severity: 'high',
        message: `HIGH AI PROBABILITY (${candidate.answerAuthenticity.aiGeneratedProbability}%) for ${name}`,
        candidateId: cId,
        organizationId: orgId
      });
    }
    if (candidate.answerAuthenticity.plagiarismSimilarity >= 80) {
      emitAlert({
        type: 'PLAGIARISM',
        severity: 'high',
        message: `HIGH SIMILARITY SCORE (${candidate.answerAuthenticity.plagiarismSimilarity}%) for ${name}`,
        candidateId: cId,
        organizationId: orgId
      });
    }
    if (candidate.answerAuthenticity.authenticityScore < 50) {
      emitAlert({
        type: 'LOW_AUTHENTICITY',
        severity: 'medium',
        message: `LOW AUTHENTICITY SCORE (${candidate.answerAuthenticity.authenticityScore}) for ${name}`,
        candidateId: cId,
        organizationId: orgId
      });
    }
  }
};
