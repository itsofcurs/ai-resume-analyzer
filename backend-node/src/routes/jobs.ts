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
