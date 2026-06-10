import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { Scorecard } from '../models/Scorecard';
import { io } from '../server'; // Ensure io can be imported or we just skip realtime for this unless needed

const router = Router();

// GET all scorecards for a candidate
router.get('/candidate/:candidateId', authenticateToken, async (req: any, res: any) => {
  try {
    const { candidateId } = req.params;
    const organizationId = req.user.organizationId;

    const scorecards = await Scorecard.find({ candidateId, organizationId }).sort({ createdAt: -1 });
    res.status(200).json(scorecards);
  } catch (error: any) {
    console.error("Fetch scorecards error:", error.message);
    res.status(500).json({ error: 'Failed to fetch scorecards' });
  }
});

// POST a new scorecard
router.post('/', authenticateToken, async (req: any, res: any) => {
  try {
    const { candidateId, technicalScore, behavioralScore, communicationScore, confidenceScore, overallScore, notes, recommendation } = req.body;
    const organizationId = req.user.organizationId;
    const interviewerId = req.user.id;

    if (!candidateId || !recommendation) {
      return res.status(400).json({ error: 'candidateId and recommendation are required' });
    }

    const scorecard = new Scorecard({
      candidateId,
      interviewerId,
      organizationId,
      technicalScore: technicalScore || 0,
      behavioralScore: behavioralScore || 0,
      communicationScore: communicationScore || 0,
      confidenceScore: confidenceScore || 0,
      overallScore: overallScore || 0,
      notes: notes || '',
      recommendation
    });

    await scorecard.save();

    res.status(201).json(scorecard);
  } catch (error: any) {
    console.error("Create scorecard error:", error.message);
    res.status(500).json({ error: 'Failed to create scorecard' });
  }
});

// GET aggregated hiring recommendation
router.get('/recommendation/:candidateId', authenticateToken, async (req: any, res: any) => {
  try {
    const { candidateId } = req.params;
    const organizationId = req.user.organizationId;

    const scorecards = await Scorecard.find({ candidateId, organizationId });
    const { Resume } = require('../models/Resume');
    const resume = await Resume.findOne({ _id: candidateId, organizationId });

    if (!resume) return res.status(404).json({ error: 'Candidate not found' });

    let finalRecommendation = 'Hold';
    let confidence = 0;

    const atsScore = Math.min(100, (resume.scores?.total || 0) * 100);
    const trustScore = resume.fraudAnalysis?.trustScore || 100;

    const voiceAnalysis = Array.isArray(resume.voiceVideoAnalysis) ? resume.voiceVideoAnalysis[0] : resume.voiceVideoAnalysis;
    const communicationScore = voiceAnalysis?.communicationScore || 0;
    const confidenceScore = voiceAnalysis?.confidenceScore || 0;
    const professionalismScore = voiceAnalysis?.professionalismScore || 0;
    
    const voiceVideoComposite = (communicationScore + confidenceScore + professionalismScore) / 3 || 0;
    
    const jdMatchScore = resume.jobMatch?.overallMatch || atsScore; // Fallback to ATS if no specific JD Match exists
    const successProbability = resume.successPrediction?.probability || resume.successPrediction?.successProbability || 0;

    let avgInterviewScore = 0;
    if (scorecards.length > 0) {
      const total = scorecards.reduce((sum, s) => sum + s.overallScore, 0);
      avgInterviewScore = total / scorecards.length;
    }

    // Weighting logic based on Certification Requirements
    confidence = (avgInterviewScore * 0.30) +
                 (atsScore * 0.20) +
                 (trustScore * 0.15) +
                 (jdMatchScore * 0.15) +
                 (successProbability * 0.10) +
                 (voiceVideoComposite * 0.10);

    if (confidence >= 85) finalRecommendation = 'STRONG HIRE';
    else if (confidence >= 70) finalRecommendation = 'HIRE';
    else if (confidence >= 55) finalRecommendation = 'HOLD';
    else finalRecommendation = 'REJECT';

    // Override if trust score is too low
    if (trustScore < 60) finalRecommendation = 'REJECT';

    res.status(200).json({
      recommendation: finalRecommendation,
      confidence: Math.round(confidence),
      breakdown: {
        ats: Math.round(atsScore),
        trust: Math.round(trustScore),
        interview: Math.round(avgInterviewScore),
        jdMatch: Math.round(jdMatchScore),
        successProbability: Math.round(successProbability),
        voiceVideo: Math.round(voiceVideoComposite)
      }
    });

  } catch (error: any) {
    console.error("Recommendation error:", error.message);
    res.status(500).json({ error: 'Failed to compute recommendation' });
  }
});

export default router;
