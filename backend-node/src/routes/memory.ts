import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import axios from 'axios';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const router = Router();
router.use(authenticateToken as any);

router.post('/store', async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const payload = { ...req.body, organizationId: req.user.organizationId };
    const response = await axios.post(`${AI_SERVICE_URL}/api/memory/store`, payload);
    res.json(response.data);
  } catch (error: any) {
    console.error("Memory Store Error:", error.message);
    res.status(500).json({ error: 'Failed to store memory' });
  }
});

router.get('/candidate/:id', async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const response = await axios.get(`${AI_SERVICE_URL}/api/memory/candidate/${req.params.id}?organizationId=${req.user.organizationId}`);
    res.json(response.data);
  } catch (error: any) {
    console.error("Memory Fetch Error:", error.message);
    res.status(500).json({ error: 'Failed to fetch candidate memory' });
  }
});

router.get('/recruiter/:id', async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const response = await axios.get(`${AI_SERVICE_URL}/api/memory/recruiter/${req.params.id}?organizationId=${req.user.organizationId}`);
    res.json(response.data);
  } catch (error: any) {
    console.error("Memory Fetch Error:", error.message);
    res.status(500).json({ error: 'Failed to fetch recruiter memory' });
  }
});

export default router;
