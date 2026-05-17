import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { prisma, cacheMap } from '../server';
import { Resume } from '../models/Resume';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import axios from 'axios';

const router = Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

router.use(authenticateToken as any);

router.get('/summary/:id', async (req: AuthRequest, res: any) => {
  try {
    const resumeId = req.params.id;
    const user = req.user!;
    
    // Fetch from MongoDB
    const resume = await Resume.findOne({ _id: resumeId, organizationId: user.organizationId });
    if (!resume || !resume.parsedData) return res.status(404).json({ error: 'Resume not found or not processed' });

    // Check Memory cache
    const cacheKey = `summary:${resumeId}`;
    const cached = cacheMap.get(cacheKey);
    if (cached) return res.json({ summary: cached, cached: true });

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `You are an expert technical recruiter. Write a highly concise, professional 3-sentence summary of this candidate based on their extracted data. Focus on years of experience, core technical stack, and most impressive achievement. 
    Candidate data: ${JSON.stringify(resume.parsedData)}`;

    const result = await model.generateContent(prompt);
    const summary = result.response.text();

    cacheMap.set(cacheKey, summary);
    res.json({ 
        summary, 
        cached: false,
        authenticity: resume.aiAnalysis // Pass authenticity data to frontend
    });
  } catch (error) {
    console.error("Copilot summary error:", error);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

router.post('/search', async (req: AuthRequest, res: any) => {
  try {
    const { query, top_k = 5 } = req.body;
    
    // Call Python Semantic Search Engine
    const pythonRes = await axios.post('http://127.0.0.1:8000/api/search', {
      query,
      top_k
    });

    const matches = pythonRes.data.matches;
    
    // Optionally fetch full resume data from MongoDB for the matches
    // But metadata from ChromaDB might be enough for a preview
    
    res.json({ query, matches });
  } catch (error) {
    console.error("Semantic search error:", error);
    res.status(500).json({ error: 'Failed to perform semantic search' });
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

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Analyze the fit between this candidate and the job description.
    Job Title: ${job.title}
    Job Description: ${job.description}
    Candidate Data: ${JSON.stringify(resume.parsedData)}
    Authenticity Alerts: ${JSON.stringify(resume.aiAnalysis)}
    
    Provide a JSON response with:
    - match_score (0-100)
    - missing_skills (array of strings)
    - key_strengths (array of strings)
    - recommendation ("Strong Hire", "Potential", "Not a fit")
    - authenticity_flags (array of strings, base this on the Authenticity Alerts provided)
    
    Return ONLY valid JSON.`;

    const result = await model.generateContent(prompt);
    let text = result.response.text();
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    res.json(JSON.parse(text));
  } catch (error) {
    console.error("Copilot analysis error:", error);
    res.status(500).json({ error: 'Failed to analyze fit' });
  }
});

export default router;
