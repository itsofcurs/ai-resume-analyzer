import { Router } from 'express';
import { Resume } from '../models/Resume';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { io } from '../server';

import { Interview } from '../models/Interview';
import { Notification } from '../models/Notification';

const router = Router();

// Webhook for Python AI service to emit question generation events
router.post('/webhook/event', async (req: any, res: any) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== (process.env.INTERNAL_API_KEY || 'default-internal-key')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { id, event } = req.body;
  if (!id || !event) {
    return res.status(400).json({ error: 'Missing id or event' });
  }

  const allowedEvents = [
    'QUESTION_GENERATION_STARTED',
    'QUESTION_GENERATION_COMPLETED',
    'QUESTION_GENERATION_FAILED',
    'INTERVIEW_COMPLETED',
    'INTERVIEW_STARTED',
    'INTERVIEW_CANCELLED',
    'VOICE_VIDEO_ANALYSIS_COMPLETED'
  ];

  if (!allowedEvents.includes(event)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid event type'
    });
  }

  try {
    const resume = await Resume.findById(id);

    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found'
      });
    }

    console.log('Interview webhook processed', {
      candidateId: id,
      organizationId: resume.organizationId,
      event
    });

    io.to(resume.organizationId.toString()).emit(event, { 
      candidateId: id,
      organizationId: resume.organizationId
    });
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Apply auth middleware to endpoints
router.use(authenticateToken as any);

// POST /api/interview/create
// Schedule a new interview and save to DB
router.post('/create', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { candidateId, interviewerName, date, meetingLink } = req.body;

    if (!candidateId || !interviewerName || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Interview Conflict Detection
    const interviewDate = new Date(date);
    const oneHourBefore = new Date(interviewDate.getTime() - 60 * 60 * 1000);
    const oneHourAfter = new Date(interviewDate.getTime() + 60 * 60 * 1000);

    const conflicts = await Interview.find({
      organizationId: user.organizationId,
      $or: [
        {
          interviewerName,
          date: { $gte: oneHourBefore, $lte: oneHourAfter }
        },
        {
          candidateId,
          date: { $gte: oneHourBefore, $lte: oneHourAfter }
        }
      ]
    });

    if (conflicts.length > 0) {
      const conflict = conflicts[0];
      if (conflict.interviewerName === interviewerName) {
        return res.status(409).json({ error: `Interviewer ${interviewerName} is already booked around this time.` });
      } else {
        return res.status(409).json({ error: `Candidate already has an interview booked around this time.` });
      }
    }

    const interview = await Interview.create({
      candidateId,
      organizationId: user.organizationId,
      recruiterId: user.userId,
      interviewerName,
      date: interviewDate,
      meetingLink,
      status: 'Scheduled'
    });

    // Notify the recruiter that an interview was scheduled
    await Notification.create({
      recipientId: user.userId,
      organizationId: user.organizationId,
      type: 'INTERVIEW_SCHEDULED',
      message: `Interview scheduled with ${interviewerName} on ${interviewDate.toLocaleString()}`,
      relatedEntityId: interview._id.toString()
    });

    const activityEntry = {
      action: 'SCHEDULED_INTERVIEW',
      performedBy: user.userId,
      timestamp: new Date(),
      metadata: { interviewerName, date: interviewDate, meetingLink }
    };

    await Resume.updateOne(
      { _id: candidateId, organizationId: user.organizationId },
      { $push: { activityLog: activityEntry }, $set: { statusUpdatedAt: new Date() } }
    );

    io.to(user.organizationId).emit('INTERVIEW_CREATED', { candidateId, interviewId: interview._id });
    io.to(user.organizationId).emit('PIPELINE_UPDATED', { candidateIds: [candidateId] });

    res.status(201).json(interview);
  } catch (error) {
    console.error("Create interview error:", error);
    res.status(500).json({ error: 'Failed to schedule interview' });
  }
});

// GET /api/interview/timeline/:candidateId
// Merge resume pipelineHistory and scheduled interviews to return a chronological timeline
router.get('/timeline/:candidateId', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const candidateId = req.params.candidateId;

    const resume = await Resume.findOne({ _id: candidateId, organizationId: user.organizationId })
      .select('createdAt status pipelineHistory voiceVideoAnalysis');

    if (!resume) {
      return res.status(404).json({ error: 'Candidate not found or unauthorized' });
    }

    const interviews = await Interview.find({ candidateId, organizationId: user.organizationId });

    const timeline = [];

    // 1. Resume Uploaded
    timeline.push({ type: 'RESUME_UPLOADED', date: resume.createdAt, title: 'Resume Uploaded' });

    // 2. ATS Processed
    if (resume.status === 'PROCESSED' || resume.status === 'SCORING' || resume.status === 'RANKING') {
      timeline.push({ type: 'ATS_PROCESSED', date: resume.createdAt, title: 'ATS Parsing Completed' });
    }

    // 3. Pipeline Moves
    if (resume.pipelineHistory && resume.pipelineHistory.length > 0) {
      resume.pipelineHistory.forEach((ph: any) => {
        timeline.push({ 
          type: 'PIPELINE_MOVE', 
          date: ph.changedAt, 
          title: `Moved to ${ph.stage}` 
        });
      });
    }

    // 4. Interviews Scheduled
    interviews.forEach(inv => {
      timeline.push({
        type: 'INTERVIEW_SCHEDULED',
        date: inv.createdAt, // When it was created
        title: `Interview Scheduled`,
        details: `With ${inv.interviewerName} for ${new Date(inv.date).toLocaleString()}`
      });
    });

    // 5. Interviews Completed (Voice/Video Analysis)
    if (resume.voiceVideoAnalysis && resume.voiceVideoAnalysis.length > 0) {
      resume.voiceVideoAnalysis.forEach((vva: any) => {
        timeline.push({
          type: 'INTERVIEW_COMPLETED',
          date: vva.analyzedAt,
          title: `Interview Analysis Completed`,
          details: `Round: ${vva.roundType} | Integrity: ${vva.interviewIntegrityScore}`
        });
      });
    }

    // Sort chronologically
    timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json(timeline);
  } catch (error) {
    console.error("Timeline generation error:", error);
    res.status(500).json({ error: 'Failed to generate candidate timeline' });
  }
});

router.get('/:candidateId', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const candidateId = req.params.candidateId;

    const resume = await Resume.findOne({ _id: candidateId, organizationId: user.organizationId });
    if (!resume) {
      return res.status(404).json({ error: 'Candidate not found or unauthorized' });
    }

    res.json(resume.interviewQuestions || null);
  } catch (error) {
    console.error("Fetch interview questions error:", error);
    res.status(500).json({ error: 'Failed to fetch interview questions' });
  }
});

import axios from 'axios';

router.post('/regenerate', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { candidateId } = req.body;

    if (!candidateId) {
      return res.status(400).json({ error: 'Missing candidateId' });
    }

    const resume = await Resume.findOne({ _id: candidateId, organizationId: user.organizationId });
    if (!resume) {
      return res.status(404).json({ error: 'Candidate not found or unauthorized' });
    }

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const response = await axios.post(`${aiServiceUrl}/api/interview/regenerate`, {
      resume_id: candidateId
    }, {
      headers: {
        'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key'
      }
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Regenerate interview questions error:", error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to trigger interview generation' });
  }
});

  router.post('/prep', async (req: AuthRequest, res: any) => {
    try {
      const user = req.user!;
      const { candidateId, topic, mode } = req.body;
  
      if (!candidateId || !topic || !mode) {
        return res.status(400).json({ error: 'Missing required fields: candidateId, topic, mode' });
      }
  
      const resume = await Resume.findOne({ _id: candidateId, organizationId: user.organizationId });
      if (!resume) {
        return res.status(404).json({ error: 'Candidate not found or unauthorized' });
      }
  
      const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
      const response = await axios.post(`${aiServiceUrl}/api/interview/prep`, {
        resume_id: candidateId,
        topic,
        mode
      }, {
        headers: {
          'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key'
        }
      });
  
      res.status(200).json(response.data);
    } catch (error: any) {
      console.error("Interview prep error:", error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to generate interview prep' });
    }
  });

  router.post('/generate-questions', authenticateToken, async (req: any, res: any) => {
    try {
      const user = req.user;
      const { candidateId, jobDescription } = req.body;
      if (!candidateId) return res.status(400).json({ error: 'candidateId is required' });

      const resume = await Resume.findOne({ _id: candidateId, organizationId: user.organizationId });
      if (!resume) return res.status(404).json({ error: 'Candidate not found' });

      const prompt = `You are an expert technical interviewer. Generate a structured set of interview questions for this candidate based on their resume.
      ${jobDescription ? `Context: The candidate applied for this role: ${jobDescription}` : ''}
      
      Candidate Data: ${JSON.stringify(resume.parsedData)}
      Authenticity Alerts: ${JSON.stringify(resume.aiAnalysis)}
      Fraud Analysis: ${JSON.stringify(resume.fraudAnalysis)}

      Return a strictly formatted JSON object with the following keys, where each key contains an array of objects {"question": "...", "reason": "...", "expected": "..."}:
      {
        "technical": [],
        "behavioral": [],
        "integrity": []
      }`;

      const { getGenAI } = require('../services/gemini');
      const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
      const result = await model.generateContent(prompt);
      let text = result.response.text();
      text = text.replace(/```json\s?/g, '').replace(/```/g, '').trim();

      res.status(200).json(JSON.parse(text));
    } catch (error: any) {
      console.error("Generate questions error:", error.message);
      res.status(500).json({ error: 'Failed to generate categorized questions' });
    }
  });
  
  // Evaluate candidate answers against generated questions
router.post('/evaluate', authenticateToken, async (req: any, res) => {
  try {
    const user = req.user;
    const { resumeId, answers } = req.body;

    if (!resumeId || !answers || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'Missing required fields: resumeId, answers (array)' });
    }

    const resume = await Resume.findOne({ _id: resumeId, organizationId: user.organizationId });
    if (!resume) {
      return res.status(404).json({ error: 'Candidate not found or unauthorized' });
    }

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const response = await axios.post(`${aiServiceUrl}/api/interview/evaluate`, {
      resume_id: resumeId,
      answers
    }, {
      headers: {
        'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key'
      },
      timeout: 100000 // Evaluation can take some time
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Interview evaluate error:", error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to evaluate interview answers' });
  }
});

// POST /api/interview/authenticity
// Evaluate candidate answer authenticity and plagiarism
router.post('/authenticity', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { resumeId } = req.body;

    if (!resumeId) {
      return res.status(400).json({ error: 'Missing required field: resumeId' });
    }

    const resume = await Resume.findOne({ _id: resumeId, organizationId: user.organizationId });
    if (!resume) {
      return res.status(404).json({ error: 'Candidate not found or unauthorized' });
    }

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const response = await axios.post(`${aiServiceUrl}/api/interview/authenticity`, {
      resume_id: resumeId
    }, {
      headers: {
        'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key'
      },
      timeout: 100000 
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Interview authenticity error:", error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to evaluate answer authenticity' });
  }
});

// POST /api/interview/adaptive
// Generates the next question adaptively
router.post('/adaptive', authenticateToken, async (req: any, res: any) => {
  try {
    const { currentTopic, conversationHistory, resumeId } = req.body;
    
    if (!currentTopic || !conversationHistory) {
      return res.status(400).json({ error: 'currentTopic and conversationHistory are required' });
    }

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    
    const aiResponse = await axios.post(`${aiServiceUrl}/api/interview/adaptive/next`, {
      currentTopic,
      conversationHistory,
      resumeId: resumeId || "simulated",
      organizationId: req.user.organizationId
    });

    const data = aiResponse.data;

    // Emit real-time event if running live
    if (resumeId) {
      io.to(req.user.organizationId).emit('ADAPTIVE_QUESTION_GENERATED', {
        resumeId,
        nextQuestion: data.next_question,
        direction: data.direction
      });
    }

    // Trigger Skill Graph if interview is marked complete
    if (req.body.isComplete && resumeId !== "simulated") {
      axios.post(`${aiServiceUrl}/api/skill-graph/generate`, {
        resume_id: resumeId,
        organization_id: req.user.organizationId
      }).catch(err => console.error("Auto skill graph trigger failed", err.message));
    }

    res.json({
      success: true,
      nextQuestion: data.next_question,
      evaluation: data.evaluation,
      direction: data.direction
    });
  } catch (error: any) {
    console.error('Error generating adaptive question:', error.message);
    res.status(500).json({ error: 'Failed to generate adaptive question' });
  }
});

// Phase 4C Module 7: AI Interview Copilot Live Analysis
router.post('/live-analysis', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    const { candidateId, context, currentQuestion, candidateAnswer } = req.body;
    
    if (!candidateId) {
      return res.status(400).json({ error: 'Candidate ID is required' });
    }

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    
    const response = await axios.post(`${aiServiceUrl}/api/interview/live-analysis`, {
      candidate_id: candidateId,
      context,
      current_question: currentQuestion,
      candidate_answer: candidateAnswer,
      organization_id: req.user!.organizationId
    }, {
      headers: { 'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key' },
      timeout: 30000
    });

    res.json(response.data);
  } catch (error: any) {
    console.error('Live analysis error:', error.message);
    res.status(500).json({ error: 'Failed to perform live analysis' });
  }
});

export default router;
