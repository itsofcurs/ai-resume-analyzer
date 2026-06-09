import express from 'express';
import multer from 'multer';
import axios from 'axios';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Resume } from '../models/Resume';

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max size
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only MP4, WEBM, MPEG, and WAV are allowed.'));
    }
  }
});

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL || 'https://mock.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'mock-key';
const supabase = createClient(supabaseUrl, supabaseKey);

router.post('/upload', authenticateToken, upload.single('media'), async (req: AuthRequest, res: any) => {
  try {
    const orgId = req.user?.organizationId;
    const resumeId = req.body.resumeId;
    const file = req.file;

    if (!orgId || !resumeId || !file) {
      return res.status(400).json({ error: 'Organization ID, Resume ID, and Media File are required.' });
    }

    // SUPABASE UPLOAD LOGIC
    const filePath = `${orgId}/${resumeId}/${Date.now()}_${file.originalname}`;
    
    const { error: uploadError } = await supabase.storage.from('talentai-media').upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

    if (uploadError) {
      console.error('Supabase Upload Error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload media to storage.' });
    }

    const { data } = await supabase.storage.from('talentai-media').createSignedUrl(filePath, 90 * 24 * 60 * 60);
    const mediaUrl = data?.signedUrl;
    
    if (!mediaUrl) {
      return res.status(500).json({ error: 'Failed to generate signed URL.' });
    }

    // Persist as PENDING
    await Resume.updateOne(
      { _id: resumeId, organizationId: orgId },
      {
        $push: {
          voiceVideoAnalysis: {
            roundType: req.body.roundType || 'TECHNICAL',
            analysisStatus: 'PENDING',
            transcriptionStatus: 'PENDING',
            mediaUrl: mediaUrl,
            communicationScore: 0,
            confidenceScore: 0,
            clarityScore: 0,
            professionalismScore: 0,
            leadershipPresenceScore: 0,
            engagementScore: 0,
            speechRate: 0,
            fillerWordCount: 0,
            pauseFrequency: 0,
            eyeContactScore: 0,
            headStabilityScore: 0,
            faceVisibilityScore: 0,
            cameraPresenceScore: 0,
            attentionScore: 0,
            sentimentScore: 0,
            authenticityScore: 0,
            interviewIntegrityScore: 0,
            scriptReadingRisk: 'LOW',
            aiGeneratedAnswerRisk: 'LOW',
            suspiciousBehaviorFlags: [],
            transcript: '',
            strengths: [],
            weaknesses: [],
            behavioralIndicators: [],
            executiveSummary: '',
            analyzedAt: new Date()
          }
        }
      }
    );

    return res.status(200).json({
      message: 'Media uploaded successfully',
      mediaUrl: mediaUrl,
      roundType: req.body.roundType || 'TECHNICAL'
    });
  } catch (error: any) {
    console.error('Upload Error:', error);
    return res.status(500).json({ error: 'Media upload failed' });
  }
});

router.post('/analyze', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    const { resumeId, roundType, mediaUrl } = req.body;
    const orgId = req.user?.organizationId;

    if (!orgId || !resumeId) {
      return res.status(400).json({ error: 'Organization ID and Resume ID are required' });
    }

    // Create a pending entry in the database ONLY IF it doesn't exist, else update it to PROCESSING
    const resume = await Resume.findOne({ _id: resumeId, organizationId: orgId });
    if (!resume) return res.status(404).json({ error: 'Resume not found' });
    
    // Find the pending round
    const targetRound = resume.voiceVideoAnalysis?.find(r => r.mediaUrl === mediaUrl) || resume.voiceVideoAnalysis?.[resume.voiceVideoAnalysis.length - 1];
    
    if (targetRound) {
      await Resume.updateOne(
        { _id: resumeId, organizationId: orgId, "voiceVideoAnalysis._id": (targetRound as any)._id },
        { $set: { "voiceVideoAnalysis.$.analysisStatus": 'PROCESSING' } }
      );
    }

    // Forward to AI Service
    // Don't await the AI service response to prevent blocking UI
    axios.post(`${AI_SERVICE_URL}/api/media/analyze`, {
      resume_id: resumeId,
      organization_id: orgId,
      round_type: roundType || 'TECHNICAL',
      media_url: mediaUrl || ''
    }).catch(err => console.error('AI Service Analyze Error:', err.message));

    return res.status(200).json({ message: 'Voice and Video Analysis triggered successfully' });
  } catch (error: any) {
    console.error('Analyze Error:', error.message);
    return res.status(500).json({ error: 'Failed to trigger media analysis' });
  }
});

router.get('/history/:resumeId', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    const orgId = req.user?.organizationId;
    const resumeId = req.params.resumeId;

    const resume = await Resume.findOne({ _id: resumeId, organizationId: orgId }).select('voiceVideoAnalysis candidateName');
    
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    return res.status(200).json({
      candidateName: resume.candidateName,
      history: resume.voiceVideoAnalysis || []
    });
  } catch (error: any) {
    console.error('History Error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch media history' });
  }
});

router.get('/compare/:resumeId', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    const orgId = req.user?.organizationId;
    const resumeId = req.params.resumeId;

    const resume = await Resume.findOne({ _id: resumeId, organizationId: orgId }).select('voiceVideoAnalysis');
    
    if (!resume || !resume.voiceVideoAnalysis || resume.voiceVideoAnalysis.length < 2) {
      return res.status(400).json({ error: 'Not enough rounds to compare' });
    }

    const rounds = resume.voiceVideoAnalysis;
    const firstRound = rounds[0];
    const latestRound = rounds[rounds.length - 1];

    const progression = {
      communicationDelta: latestRound.communicationScore - firstRound.communicationScore,
      confidenceDelta: latestRound.confidenceScore - firstRound.confidenceScore,
      integrityDelta: latestRound.interviewIntegrityScore - firstRound.interviewIntegrityScore,
      firstRoundType: firstRound.roundType,
      latestRoundType: latestRound.roundType
    };

    return res.status(200).json({ progression });
  } catch (error: any) {
    console.error('Compare Error:', error.message);
    return res.status(500).json({ error: 'Failed to compare media rounds' });
  }
});

export default router;
