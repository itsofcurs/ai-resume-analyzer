import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma, redisClient } from '../server';
import { Resume } from '../models/Resume';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { quotaMiddleware } from '../middleware/quota';
import { copilotQueue } from '../queues/copilotQueue';
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
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;

    io.to(orgId).emit('copilot_status', { status: 'SEMANTIC_MATCHING', query });
    
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
    
    io.to(orgId).emit('copilot_status', { status: 'COMPLETED' });
    res.json({ query, matches });
  } catch (error) {
    console.error("Semantic search error:", error);
    if (req.user?.organizationId) io.to(req.user.organizationId).emit('copilot_status', { status: 'FAILED' });
    res.status(500).json({ error: 'Failed to perform semantic search' });
  }
});

router.post('/chat', async (req: AuthRequest, res: any) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });
  
  if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
  const orgId = req.user.organizationId;

  io.to(orgId).emit('copilot_status', { status: 'COPILOT_SEARCHING', query });

  try {
    let analytics_summary = null;
    try {
      const cached = await redisClient.get(`analytics_dashboard:${orgId}`);
      if (cached) analytics_summary = JSON.parse(cached.toString());
    } catch (e) {
      console.warn("Could not load analytics summary for copilot context");
    }

    const response = await axios.post(`${AI_SERVICE_URL}/api/copilot/chat`, { 
      query,
      analytics_summary 
    });
    
    io.to(orgId).emit('copilot_status', { status: 'COMPLETED' });
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Copilot Chat Error:", error.message);
    io.to(orgId).emit('copilot_status', { status: 'FAILED' });
    return res.status(500).json({ error: 'Failed to process copilot request' });
  }
});

router.post('/agent', async (req: AuthRequest, res: any) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  
  if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
  const orgId = req.user.organizationId;

  io.to(orgId).emit('COPILOT_THINKING', { message });

  try {
    io.to(orgId).emit('COPILOT_TOOL_RUNNING', { tool: 'autonomous_planner' });
    const response = await axios.post(`${AI_SERVICE_URL}/api/copilot/agent`, { 
      message,
      organization_id: orgId 
    });
    
    io.to(orgId).emit('COPILOT_TOOL_COMPLETED', { tool: 'autonomous_planner' });
    io.to(orgId).emit('COPILOT_FINISHED', { success: true });
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Copilot Agent Error:", error.message);
    io.to(orgId).emit('COPILOT_FINISHED', { success: false, error: 'Agent failed' });
    return res.status(500).json({ error: 'Failed to process copilot agent request' });
  }
});

router.post('/autonomous', async (req: AuthRequest, res: any) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  
  if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
  const orgId = req.user.organizationId;

  io.to(orgId).emit('COPILOT_THINKING', { message });

  try {
    io.to(orgId).emit('COPILOT_TOOL_RUNNING', { tool: 'autonomous_recruiter' });
    const response = await axios.post(`${AI_SERVICE_URL}/api/copilot/agent`, { 
      message,
      organization_id: orgId 
    });
    
    io.to(orgId).emit('COPILOT_TOOL_COMPLETED', { tool: 'autonomous_recruiter' });
    io.to(orgId).emit('COPILOT_FINISHED', { success: true });
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Copilot Autonomous Error:", error.message);
    io.to(orgId).emit('COPILOT_FINISHED', { success: false, error: 'Agent failed' });
    return res.status(500).json({ error: 'Failed to process autonomous request' });
  }
});

// Phase 4C Module 4 & 8: Interactive Recruiter Copilot
router.post('/recruiter', quotaMiddleware, async (req: AuthRequest, res: any) => {
  const { candidateId, jobId, recruiterPrompt } = req.body;
  if (!candidateId || !recruiterPrompt) return res.status(400).json({ error: 'candidateId and recruiterPrompt are required' });
  
  if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
  const orgId = req.user.organizationId;

  try {
    const job = await copilotQueue.add('recruiter-copilot', {
      candidate_id: candidateId,
      job_id: jobId,
      recruiter_prompt: recruiterPrompt,
      organization_id: orgId 
    }, {
      jobId: `recruiter-${candidateId}-${Date.now()}`
    });
    
    return res.status(202).json({
      accepted: true,
      jobId: job.id,
      status: 'queued'
    });
  } catch (error: any) {
    console.error("Interactive Recruiter Copilot Error:", error.message);
    return res.status(500).json({ error: 'Failed to queue recruiter copilot request' });
  }
});

// Phase 4C Module 1: Rediscovery Engine
router.post('/rediscovery/search', async (req: AuthRequest, res: any) => {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ error: 'Job ID is required' });
  
  if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
  const orgId = req.user.organizationId;

  try {
    const response = await axios.post(`${AI_SERVICE_URL}/api/rediscovery/search`, { 
      job_id: jobId,
      organization_id: orgId 
    }, {
      headers: { 'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key' },
      timeout: 60000
    });
    
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Rediscovery Error:", error.message);
    return res.status(500).json({ error: 'Failed to perform rediscovery search' });
  }
});

// Phase 4C Module 3: AI Outreach Generator
router.post('/outreach/generate', quotaMiddleware, async (req: AuthRequest, res: any) => {
  const { candidateId, jobId, outreachType, notes } = req.body;
  if (!candidateId) return res.status(400).json({ error: 'Candidate ID is required' });
  
  if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
  const orgId = req.user.organizationId;

  try {
    const job = await copilotQueue.add('outreach-generate', {
      candidate_id: candidateId,
      job_id: jobId,
      outreach_type: outreachType,
      notes: notes,
      organization_id: orgId 
    }, {
      jobId: `outreach-${candidateId}-${Date.now()}`
    });
    
    // Update candidateEngagement metrics
    const resume = await Resume.findOne({ _id: candidateId, organizationId: orgId });
    if (resume) {
      if (!resume.candidateEngagement) {
        resume.candidateEngagement = {
          outreachCount: 0,
          responseRate: 0,
          engagementScore: 0
        };
      }
      resume.candidateEngagement.outreachCount = (resume.candidateEngagement.outreachCount || 0) + 1;
      resume.candidateEngagement.lastContacted = new Date();
      await resume.save();
    }

    return res.status(202).json({
      accepted: true,
      jobId: job.id,
      status: 'queued'
    });
  } catch (error: any) {
    console.error("Outreach Generation Error:", error.message);
    return res.status(500).json({ error: 'Failed to queue outreach generation' });
  }
});

// Phase 4C Module 2: CRM Response tracking
router.post('/outreach/responded', async (req: AuthRequest, res: any) => {
  const { candidateId } = req.body;
  if (!candidateId) return res.status(400).json({ error: 'Candidate ID is required' });
  
  if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
  const orgId = req.user.organizationId;

  try {
    const resume = await Resume.findOne({ _id: candidateId, organizationId: orgId });
    if (!resume) return res.status(404).json({ error: 'Candidate not found' });

    if (!resume.candidateEngagement) {
      resume.candidateEngagement = { outreachCount: 1, responseRate: 0, engagementScore: 0 };
    }
    
    // Simulate updating response metrics (simplistic calculation)
    const currentOutreaches = resume.candidateEngagement.outreachCount || 1;
    // Assume 1 response for this demo endpoint
    const responses = 1; 
    resume.candidateEngagement.responseRate = Math.round((responses / currentOutreaches) * 100);
    resume.candidateEngagement.engagementScore = Math.min(100, (resume.candidateEngagement.engagementScore || 0) + 25);
    
    await resume.save();

    return res.status(200).json({ message: 'Response recorded', metrics: resume.candidateEngagement });
  } catch (error: any) {
    console.error("Outreach Response Error:", error.message);
    return res.status(500).json({ error: 'Failed to record response' });
  }
});

router.post('/recommend', async (req: AuthRequest, res: any) => {
  const { job_description, top_k = 5 } = req.body;
  if (!job_description) return res.status(400).json({ error: 'Job description is required' });
  if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
  const orgId = req.user.organizationId;

  io.to(orgId).emit('copilot_status', { status: 'RECOMMENDING' });

  try {
    const response = await axios.post(`${AI_SERVICE_URL}/api/recommend`, { job_description, top_k });
    io.to(orgId).emit('copilot_status', { status: 'COMPLETED' });
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Recommend Error:", error.message);
    io.to(orgId).emit('copilot_status', { status: 'FAILED' });
    return res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

router.post('/compare', async (req: AuthRequest, res: any) => {
  const { candidate_a_id, candidate_b_id } = req.body;
  if (!candidate_a_id || !candidate_b_id) return res.status(400).json({ error: 'Both candidate IDs required' });
  if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
  const orgId = req.user.organizationId;

  io.to(orgId).emit('copilot_status', { status: 'COMPARING' });

  try {
    const response = await axios.post(`${AI_SERVICE_URL}/api/compare`, { candidate_a_id, candidate_b_id });
    io.to(orgId).emit('copilot_status', { status: 'COMPLETED' });
    return res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Compare Error:", error.message);
    io.to(orgId).emit('copilot_status', { status: 'FAILED' });
    return res.status(500).json({ error: 'Failed to generate comparison' });
  }
});

router.post('/compare_multi', async (req: AuthRequest, res: any) => {
  try {
    const { candidateIds } = req.body;
    const user = req.user!;
    if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length < 2) {
      return res.status(400).json({ error: 'At least 2 candidate IDs are required' });
    }

    const resumes = await Resume.find({ _id: { $in: candidateIds }, organizationId: user.organizationId });
    if (resumes.length !== candidateIds.length) {
      return res.status(404).json({ error: 'One or more candidates not found' });
    }

    const prompt = `You are an expert technical recruiter comparing ${resumes.length} candidates.
    Provide a detailed, side-by-side comparison in JSON format.
    
    Candidates:
    ${resumes.map((r, i) => `
    Candidate ${i + 1}:
    ID: ${r._id}
    Name: ${r.candidateName || r.filename}
    Data: ${JSON.stringify(r.parsedData)}
    `).join('\n')}
    
    Return ONLY valid JSON with this exact structure:
    {
      "matrix": [
        {
          "candidateId": "id string",
          "candidateName": "name string",
          "strengths": ["...", "..."],
          "weaknesses": ["...", "..."],
          "superlative": "Short phrase like 'Best Technical Fit' or 'Most Experienced'"
        }
      ],
      "recommendation": "Overall recommendation on who to hire and why."
    }`;

    const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(prompt);
    let text = result.response.text();
    text = text.replace(/```json\s?/g, '').replace(/```/g, '').trim();

    return res.status(200).json(JSON.parse(text));
  } catch (error: any) {
    console.error("Multi-Compare Error:", error.message);
    return res.status(500).json({ error: 'Failed to generate multi-candidate comparison' });
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

router.post('/recruiter', async (req: AuthRequest, res: any) => {
  try {
    const { candidateId, jobId, recruiterPrompt } = req.body;
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const organizationId = req.user.organizationId;
    
    const response = await axios.post(`${AI_SERVICE_URL}/api/copilot/recruiter`, {
      candidate_id: candidateId,
      job_id: jobId,
      recruiter_prompt: recruiterPrompt,
      organization_id: organizationId
    }, {
      headers: { 'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key' }
    });
    
    res.json(response.data);
  } catch (error: any) {
    console.error("Recruiter Copilot Error:", error.message);
    res.status(500).json({ error: 'Failed to execute recruiter copilot' });
  }
});

router.post('/outreach', async (req: AuthRequest, res: any) => {
  try {
    const { candidateId, notes } = req.body;
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    
    // In a real scenario, this endpoint might generate an email. For CRM purposes, we just log it.
    await Resume.findOneAndUpdate(
      { _id: candidateId, organizationId: req.user.organizationId },
      { 
        $inc: { "candidateEngagement.outreachCount": 1 },
        $set: { "candidateEngagement.lastContacted": new Date() }
      }
    );
    
    res.json({ status: "success", message: "Outreach logged successfully" });
  } catch (error: any) {
    console.error("Outreach Error:", error.message);
    res.status(500).json({ error: 'Failed to log outreach' });
  }
});

router.post('/outreach/responded', async (req: AuthRequest, res: any) => {
  try {
    const { candidateId } = req.body;
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    
    const candidate = await Resume.findOne({ _id: candidateId, organizationId: req.user.organizationId });
    if (!candidate) return res.status(404).json({ error: 'Candidate not found' });
    
    const engagement = candidate.candidateEngagement || { outreachCount: 0, responseRate: 0, engagementScore: 0 };
    
    // Simulate candidate responding
    const totalResponses = Math.round((engagement.responseRate || 0) / 100 * (engagement.outreachCount || 0)) + 1;
    const newCount = Math.max(engagement.outreachCount || 1, 1);
    const newRate = Math.min((totalResponses / newCount) * 100, 100);
    const newScore = Math.min((engagement.engagementScore || 50) + 20, 100);
    
    await Resume.updateOne(
      { _id: candidateId },
      {
        $set: {
          "candidateEngagement.responseRate": newRate,
          "candidateEngagement.engagementScore": newScore
        }
      }
    );
    
    res.json({ status: "success", responseRate: newRate, engagementScore: newScore });
  } catch (error: any) {
    console.error("Outreach Response Error:", error.message);
    res.status(500).json({ error: 'Failed to log response' });
  }
});
router.post('/explain', quotaMiddleware, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    
    // Proxy request to python via queue
    const job = await copilotQueue.add('explain-recommendation', {
      ...req.body,
      organizationId: req.user.organizationId,
      userId: req.user.userId
    }, {
      jobId: `explain-${req.user.organizationId}-${Date.now()}`
    });
    
    res.status(202).json({
      accepted: true,
      jobId: job.id,
      status: 'queued'
    });
  } catch (error: any) {
    console.error("Explainability Queue Error:", error.message);
    res.status(500).json({ error: 'Failed to queue explainability request' });
  }
});

export default router;
