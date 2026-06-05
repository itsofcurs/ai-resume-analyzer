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
      }
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Interview prep error:", error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate interview prep' });
  }
});

export default router;
