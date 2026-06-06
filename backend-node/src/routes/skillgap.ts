import { Router } from 'express';
import { Resume } from '../models/Resume';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import axios from 'axios';

const router = Router();

router.use(authenticateToken as any);

router.post('/analyze', async (req: AuthRequest, res: any) => {
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

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    // Fire and forget, or wait for response. We'll wait since it's a direct API call.
    const response = await axios.post(`${aiServiceUrl}/api/skill-gap/analyze`, {
      resume_id: resumeId
    }, {
      headers: {
        'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key'
      },
      timeout: 100000 // Skill gap analysis takes time
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Skill Gap analyze error:", error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to trigger skill gap analysis' });
  }
});

export default router;
