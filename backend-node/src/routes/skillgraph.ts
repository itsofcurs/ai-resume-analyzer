import express from 'express';
import { authenticateToken } from '../middleware/auth';
import axios from 'axios';

const router = express.Router();

// POST /api/skill-graph/generate
router.post('/generate', authenticateToken, async (req: any, res: any) => {
  try {
    const { resumeId } = req.body;
    
    if (!resumeId) {
      return res.status(400).json({ error: 'resumeId is required' });
    }

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    
    // Non-blocking call to AI Service to trigger generation
    axios.post(`${aiServiceUrl}/api/skill-graph/generate`, {
      resume_id: resumeId,
      organization_id: req.user.organizationId
    }).catch(err => console.error("Failed to trigger skill graph generation in AI service", err.message));

    res.json({
      success: true,
      message: "Skill Graph generation started",
      resumeId
    });
  } catch (error: any) {
    console.error('Error generating skill graph:', error.message);
    res.status(500).json({ error: 'Failed to generate skill graph' });
  }
});

export default router;
