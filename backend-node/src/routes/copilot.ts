import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma, redisClient } from '../server';
import { Resume } from '../models/Resume';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { io } from '../server';
import axios from 'axios';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

const router = Router();

const getGeminiKeys = (): string[] => {
  if (process.env.GEMINI_API_KEYS) {
      return process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(k => k.length > 0);
  }
  if (process.env.GEMINI_API_KEY) {
      return [process.env.GEMINI_API_KEY.trim()];
  }
  return [];
};

const keys = getGeminiKeys();
const genAIPool = keys.map(key => new GoogleGenerativeAI(key));
let currentKeyIndex = 0;

const getGenAI = (): GoogleGenerativeAI => {
    if (genAIPool.length === 0) throw new Error("No Gemini API keys configured");
    const genAI = genAIPool[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % genAIPool.length;
    return genAI;
};

router.use(authenticateToken as any);

router.get('/summary/:id', async (req: AuthRequest, res: any) => {
  try {
    const resumeId = req.params.id;
    const user = req.user!;
    
    // Fetch from MongoDB
    const resume = await Resume.findOne({ _id: resumeId, organizationId: user.organizationId });
    if (!resume || !resume.parsedData) return res.status(404).json({ error: 'Resume not found or not processed' });

    // Check Redis cache
    const cacheKey = `summary:${resumeId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.json({ summary: cached, cached: true, authenticity: resume.aiAnalysis });

    const prompt = `You are an expert technical recruiter. Write a highly concise, professional 3-sentence summary of this candidate based on their extracted data. Focus on years of experience, core technical stack, and most impressive achievement. 
    Candidate data: ${JSON.stringify(resume.parsedData)}`;

    let summary = "";
    let lastError = null;
    const maxRetries = Math.min(genAIPool.length, 3); // try up to 3 keys

    for (let i = 0; i < maxRetries; i++) {
        try {
            const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(prompt);
            summary = result.response.text();
            break; // Success!
        } catch (err: any) {
            console.error(`Attempt ${i + 1} failed:`, err?.statusText || err?.message);
            lastError = err;
            // if it's not a server/rate-limit error (e.g. invalid prompt), maybe we should break? 
            // but 403 and 503 and 429 are all good candidates to retry with a different key
        }
    }

    if (!summary) {
        throw lastError; // if all retries failed, throw the last error to be caught by the outer catch
    }

    await redisClient.setEx(cacheKey, 3600 * 24, summary); // cache for 24 hours
    res.json({ 
        summary, 
        cached: false,
        authenticity: resume.aiAnalysis, // Pass authenticity data to frontend
        fraudAnalysis: resume.fraudAnalysis // Pass fraud analysis to frontend
    });
  } catch (error: any) {
    console.error("Copilot summary error:", error);
    if (error?.status === 429 || error?.message?.includes('429')) {
      return res.status(429).json({ error: 'Gemini API Rate Limit Exceeded (Free Tier). Please wait 1 minute before generating more summaries.' });
    }
    if (error?.status === 503 || error?.message?.includes('503')) {
      return res.status(503).json({ error: 'Gemini API is currently experiencing high demand. Please try again later.' });
    }
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

router.post('/search', async (req: AuthRequest, res: any) => {
  try {
    const { query, top_k = 5 } = req.body;
    io.emit('copilot_status', { status: 'SEMANTIC_MATCHING', query });
    
    // Call Python Semantic Search Engine
    const pythonRes = await axios.post(`${AI_SERVICE_URL}/api/search`, {
      query,
      top_k
    }, {
      headers: {
        'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key'
      }
    });

    const matches = pythonRes.data.matches;
    
    io.emit('copilot_status', { status: 'COMPLETED' });
    res.json({ query, matches });
  } catch (error) {
    console.error("Semantic search error:", error);
    io.emit('copilot_status', { status: 'FAILED' });
    res.status(500).json({ error: 'Failed to perform semantic search' });
  }
});

router.post('/chat', async (req: AuthRequest, res: any) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  io.emit('copilot_status', { status: 'COPILOT_SEARCHING', query });

  try {
    const response = await axios.post(`${AI_SERVICE_URL}/api/copilot/chat`, { query });
    io.emit('copilot_status', { status: 'COMPLETED' });
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Copilot Chat Error:", error.message);
    io.emit('copilot_status', { status: 'FAILED' });
    return res.status(500).json({ error: 'Failed to process copilot request' });
  }
});

router.post('/recommend', async (req: AuthRequest, res: any) => {
  const { job_description, top_k = 5 } = req.body;
  if (!job_description) return res.status(400).json({ error: 'Job description is required' });

  io.emit('copilot_status', { status: 'RECOMMENDING' });

  try {
    const response = await axios.post(`${AI_SERVICE_URL}/api/recommend`, { job_description, top_k });
    io.emit('copilot_status', { status: 'COMPLETED' });
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Recommend Error:", error.message);
    io.emit('copilot_status', { status: 'FAILED' });
    return res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

router.post('/compare', async (req: AuthRequest, res: any) => {
  const { candidate_a_id, candidate_b_id } = req.body;
  if (!candidate_a_id || !candidate_b_id) return res.status(400).json({ error: 'Both candidate IDs required' });

  io.emit('copilot_status', { status: 'COMPARING' });

  try {
    const response = await axios.post(`${AI_SERVICE_URL}/api/compare`, { candidate_a_id, candidate_b_id });
    io.emit('copilot_status', { status: 'COMPLETED' });
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Compare Error:", error.message);
    io.emit('copilot_status', { status: 'FAILED' });
    return res.status(500).json({ error: 'Failed to generate comparison' });
  }
});

router.post('/analyze_fit', async (req: AuthRequest, res: any) => {
  try {
    const { resumeId, jobId } = req.body;
    const user = req.user!;
    
    // Fetch from MongoDB
    const resume = await Resume.findOne({ _id: resumeId, organizationId: user.organizationId });
    // Fetch from Prisma (PostgreSQL)
    const job = await prisma.jobDescription.findUnique({ where: { id: jobId, organizationId: user.organizationId } });

    if (!resume || !job) return res.status(404).json({ error: 'Resume or Job not found' });

    const prompt = `Analyze the fit between this candidate and the job description.
    Job Title: ${job.title}
    Job Description: ${job.description}
    Candidate Data: ${JSON.stringify(resume.parsedData)}
    Authenticity Alerts: ${JSON.stringify(resume.aiAnalysis)}
    Fraud Analysis (Phase 2C-B): ${JSON.stringify(resume.fraudAnalysis)}
    Skill Gap Intelligence (Phase 2C-C): ${JSON.stringify(resume.skillGapAnalysis)}
    Predictive Hiring (Phase 2C-D): ${JSON.stringify(resume.predictiveHiring)}
    
    Provide a JSON response with:
    - match_score (0-100)
    - missing_skills (array of strings)
    - key_strengths (array of strings)
    - recommendation ("Strong Hire", "Potential", "Not a fit")
    - authenticity_flags (array of strings, base this on the Authenticity Alerts provided)
    
    Return ONLY valid JSON.`;

    let text = "";
    let lastError = null;
    const maxRetries = Math.min(genAIPool.length, 3);

    for (let i = 0; i < maxRetries; i++) {
        try {
            const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent(prompt);
            text = result.response.text();
            break;
        } catch (err: any) {
            console.error(`Analyze attempt ${i + 1} failed:`, err?.statusText || err?.message);
            lastError = err;
        }
    }

    if (!text) throw lastError;

    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    res.json(JSON.parse(text));
  } catch (error: any) {
    console.error("Copilot analysis error:", error);
    if (error?.status === 429 || error?.message?.includes('429')) {
      return res.status(429).json({ error: 'Gemini API Rate Limit Exceeded (Free Tier). Please wait 1 minute before evaluating more candidates.' });
    }
    if (error?.status === 503 || error?.message?.includes('503')) {
      return res.status(503).json({ error: 'Gemini API is currently experiencing high demand. Please try again later.' });
    }
    res.status(500).json({ error: 'Failed to analyze fit' });
  }
});

export default router;
