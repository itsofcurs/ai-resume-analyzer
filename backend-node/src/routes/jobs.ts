import { Router } from 'express';
import { prisma } from '../server';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

router.use(authenticateToken as any);

// Get all jobs for the organization
router.get('/', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const jobs = await prisma.jobDescription.findMany({
      where: { organizationId: user.organizationId as string },
      orderBy: { createdAt: 'desc' }
    });
    res.json(jobs);
  } catch (error) {
    console.error("Fetch jobs error:", error);
    res.status(500).json({ error: 'Failed to fetch job roles' });
  }
});

import axios from 'axios';
import { Resume } from '../models/Resume';

// Rank candidates against a specific job description
router.get('/:id/candidates', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const jobId = req.params.id as string;

    // Fetch Job Description
    const job = await prisma.jobDescription.findFirst({
      where: { id: jobId, organizationId: user.organizationId as string }
    });

    if (!job) {
      return res.status(404).json({ error: 'Job role not found' });
    }

    // Fetch Candidates for this org
    const resumes = await Resume.find({ 
      organizationId: user.organizationId as string,
      status: 'PROCESSED'
    }).limit(50); // Hard limit for batch size for now

    if (!resumes || resumes.length === 0) {
      return res.status(200).json({ ranking: [] });
    }

    const payload = {
      resumes: resumes.map(r => ({
        candidate_id: r._id.toString(),
        candidate_name: r.parsedData?.personalInfo?.name || 'Unknown Candidate',
        resume_text: r.rawText || ''
      })).filter(r => r.resume_text.length >= 20),
      job_description_text: job.description,
      required_skills: job.requiredSkills ? job.requiredSkills.split(',').map(s => s.trim()) : []
    };

    if (payload.resumes.length === 0) {
      return res.status(200).json({ ranking: [] });
    }

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const response = await axios.post(`${aiServiceUrl}/api/job-match/batch`, payload, {
      headers: {
        'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key'
      }
    });

    res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Rank candidates error:", error.message);
    res.status(500).json({ error: 'Failed to rank candidates' });
  }
});

// Single candidate vs JD match (Python backend)
router.post('/:id/match', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const jobId = req.params.id as string;
    const { candidateId } = req.body;

    const job = await prisma.jobDescription.findFirst({
      where: { id: jobId, organizationId: user.organizationId as string }
    });

    if (!job) return res.status(404).json({ error: 'Job role not found' });

    const resume = await Resume.findOne({ _id: candidateId, organizationId: user.organizationId as string });
    
    if (!resume) return res.status(404).json({ error: 'Candidate not found' });

    const payload = {
      resume_text: resume.rawText || '',
      job_description_text: job.description,
      required_skills: job.requiredSkills ? job.requiredSkills.split(',').map(s => s.trim()) : []
    };

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
    const response = await axios.post(`${aiServiceUrl}/api/job-match`, payload, {
      headers: {
        'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key'
      }
    });

    res.status(200).json(response.data);
  } catch (error: any) {
    console.error("Match candidate error:", error.message);
    res.status(500).json({ error: 'Failed to match candidate' });
  }
});

// Create a new job role
router.post('/', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { title, description, requiredSkills } = req.body;
    
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and Description are required' });
    }

    const job = await prisma.jobDescription.create({
      data: {
        title,
        description,
        requiredSkills: requiredSkills || '',
        organizationId: user.organizationId as string
      }
    });

    res.status(201).json(job);
  } catch (error) {
    console.error("Create job error:", error);
    res.status(500).json({ error: 'Failed to create job role' });
  }
});

// Update a job role
router.put('/:id', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const jobId = req.params.id as string;
    const { title, description, requiredSkills } = req.body;

    const existingJob = await prisma.jobDescription.findFirst({
      where: { id: jobId, organizationId: user.organizationId as string }
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job role not found' });
    }

    const updatedJob = await prisma.jobDescription.update({
      where: { id: jobId },
      data: {
        title: title || existingJob.title,
        description: description || existingJob.description,
        requiredSkills: requiredSkills !== undefined ? requiredSkills : existingJob.requiredSkills
      }
    });

    res.json(updatedJob);
  } catch (error) {
    console.error("Update job error:", error);
    res.status(500).json({ error: 'Failed to update job role' });
  }
});

// Delete a job role
router.delete('/:id', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const jobId = req.params.id as string;

    const existingJob = await prisma.jobDescription.findFirst({
      where: { id: jobId, organizationId: user.organizationId as string }
    });

    if (!existingJob) {
      return res.status(404).json({ error: 'Job role not found' });
    }

    await prisma.jobDescription.delete({
      where: { id: jobId }
    });

    res.json({ message: 'Job role deleted successfully' });
  } catch (error) {
    console.error("Delete job error:", error);
    res.status(500).json({ error: 'Failed to delete job role' });
  }
});

export default router;
