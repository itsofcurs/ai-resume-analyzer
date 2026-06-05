import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Resume } from '../models/Resume';
import axios from 'axios';

const router = express.Router();

router.post('/analyze', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { resumeId } = req.body;

    if (!resumeId) {
      return res.status(400).json({ error: 'Missing resumeId' });
    }

    const resume = await Resume.findOne({ _id: resumeId, organizationId: user.organizationId });
    if (!resume) {
      return res.status(404).json({ error: 'Candidate not found or unauthorized' });
    }

    // Call Python AI Service
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const response = await axios.post(`${aiServiceUrl}/api/fraud/analyze`, {
      resume_id: resumeId
    }, {
      headers: {
        'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key'
      },
      timeout: 80000 
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Fraud analyze error:", error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to trigger fraud analysis' });
  }
});

export default router;
