import { Router } from 'express';
import { uploadCloudinary } from '../services/cloudinary';
import { Resume } from '../models/Resume';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { io } from '../server';
import axios from 'axios';

const router = Router();

// Apply auth middleware to all resume routes
router.use(authenticateToken as any);

router.post('/upload', uploadCloudinary.single('file'), async (req: AuthRequest, res: any) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const user = req.user!;
    
    // Create resume in MongoDB
    const resume = new Resume({
      filename: req.file.originalname,
      cloudinaryUrl: req.file.path, // Cloudinary URL
      rawText: "Pending extraction...", // Will be updated by AI service
      status: 'PENDING',
      uploadedBy: user.userId,
      organizationId: user.organizationId
    });

    await resume.save();

    res.status(202).json({ 
      message: "Upload successful, processing started", 
      id: resume._id,
      cloudinaryUrl: resume.cloudinaryUrl
    });

    // Notify clients that a new resume is pending
    io.emit('resume_status_update', { id: resume._id, status: "PENDING" });

    // Trigger AI Service Pipeline (Sprint 3)
    try {
      // Don't await this, let it run in the background
      axios.post('http://127.0.0.1:8000/api/process', {
        resume_id: resume._id.toString(),
        cloudinary_url: resume.cloudinaryUrl,
        filename: resume.filename
      }).catch(err => {
        console.error("Webhook trigger failed:", err.message);
        if (err.response) {
          console.error("Webhook error response:", err.response.data);
        }
      });
    } catch (e) {
      console.error("Failed to initiate webhook:", e);
    }

  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.get('/', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    // Only fetch resumes for this organization
    const resumes = await Resume.find({ organizationId: user.organizationId }).sort({ createdAt: -1 });
    res.json(resumes);
  } catch (error) {
    console.error("Fetch resumes error:", error);
    res.status(500).json({ error: 'Failed to fetch resumes' });
  }
});

router.get('/stats', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const orgId = user.organizationId;

    const total = await Resume.countDocuments({ organizationId: orgId });
    const processed = await Resume.countDocuments({ organizationId: orgId, status: 'PROCESSED' });
    const failed = await Resume.countDocuments({ organizationId: orgId, status: 'FAILED' });
    
    // Aggregate unique skills (assuming parsedData.skills exists)
    const resumes = await Resume.find({ organizationId: orgId, status: 'PROCESSED' }, 'parsedData.skills');
    const allSkills = new Set();
    resumes.forEach(r => {
      if (r.parsedData?.skills && Array.isArray(r.parsedData.skills)) {
        r.parsedData.skills.forEach((s: any) => {
            if (typeof s === 'string') allSkills.add(s);
            else if (s.skill) allSkills.add(s.skill); // handle object structure
        });
      }
    });

    res.json({
      total_resumes: total,
      processed: processed,
      failed: failed,
      unique_skills: allSkills.size
    });
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
