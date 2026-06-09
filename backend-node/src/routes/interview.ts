import { Router } from 'express';
import { Resume } from '../models/Resume';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { io } from '../server';

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

  // event should be one of:
  // QUESTION_GENERATION_STARTED
  // QUESTION_GENERATION_COMPLETED
  // QUESTION_GENERATION_FAILED
  io.emit(event, { candidateId: id });
  res.status(200).json({ success: true });
});

// Apply auth middleware to endpoints
router.use(authenticateToken as any);

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
      },
      timeout: 80000 // 80 second timeout to avoid Render's 100s proxy kill
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Interview prep error:", error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate interview prep' });
  }
});

// POST /api/interview/evaluate
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
      io.emit('ADAPTIVE_QUESTION_GENERATED', {
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

export default router;
