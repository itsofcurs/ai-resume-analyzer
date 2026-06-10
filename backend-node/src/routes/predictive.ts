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
    const response = await axios.post(`${aiServiceUrl}/api/predictive-hiring/analyze`, {
      resume_id: resumeId
    }, {
      headers: {
        'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key'
      },
      timeout: 120000 // Predictive analysis can take time
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Predictive hiring analyze error:", error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to trigger predictive hiring analysis' });
  }
});

router.post('/offer-acceptance', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { candidateId, offeredSalary } = req.body;
    
    const resume = await Resume.findOne({ _id: candidateId, organizationId: user.organizationId });
    if (!resume) return res.status(404).json({ error: 'Candidate not found' });

    const prompt = `You are a recruitment analytics AI. Predict the probability that this candidate will accept a job offer of ${offeredSalary || 'market rate'}, based on their resume data: ${JSON.stringify(resume.parsedData)}. 
    Return ONLY a raw integer between 0 and 100 representing the percentage likelihood. Do not explain.`;

    const { getGenAI } = require('../services/gemini');
    const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const score = parseInt(result.response.text().replace(/\D/g, '')) || 50;
    const probability = Math.min(100, Math.max(0, score));

    if (!resume.predictiveHiring) resume.predictiveHiring = {};
    resume.predictiveHiring.offerAcceptance = probability;
    resume.predictiveHiring.lastCalculatedAt = new Date();
    resume.markModified('predictiveHiring');
    await resume.save();

    res.json({ probability });
  } catch (error: any) {
    console.error("Offer Prediction error", error);
    res.status(500).json({ error: 'Failed to calculate offer prediction' });
  }
});

router.post('/flight-risk', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { candidateId } = req.body;
    
    const resume = await Resume.findOne({ _id: candidateId, organizationId: user.organizationId });
    if (!resume) return res.status(404).json({ error: 'Candidate not found' });

    const prompt = `You are a workforce analytics AI. Evaluate the flight risk (probability of leaving within 6 months) for this candidate based on their job tenure history, job hopping patterns, and career progression in this data: ${JSON.stringify(resume.parsedData)}.
    Return ONLY a raw integer between 0 and 100 representing the flight risk percentage. Do not explain.`;

    const { getGenAI } = require('../services/gemini');
    const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    const score = parseInt(result.response.text().replace(/\D/g, '')) || 30;
    const probability = Math.min(100, Math.max(0, score));

    if (!resume.predictiveHiring) resume.predictiveHiring = {};
    resume.predictiveHiring.flightRisk = probability;
    resume.predictiveHiring.lastCalculatedAt = new Date();
    resume.markModified('predictiveHiring');
    await resume.save();

    res.json({ probability });
  } catch (error: any) {
    console.error("Flight risk prediction error", error);
    res.status(500).json({ error: 'Failed to calculate flight risk' });
  }
});

export default router;
