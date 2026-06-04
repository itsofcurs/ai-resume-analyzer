import { Router } from 'express';
import { uploadCloudinary } from '../services/cloudinary';
import { Resume } from '../models/Resume';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { io } from '../server';
import axios from 'axios';

const router = Router();

// Webhook for Python AI service to update status
router.post('/webhook/status', async (req: any, res: any) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== (process.env.INTERNAL_API_KEY || 'default-internal-key')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { id, status } = req.body;
  if (!id || !status) {
    return res.status(400).json({ error: 'Missing id or status' });
  }

  // Emit to all connected clients
  io.emit('resume_status_update', { id, status });
  res.status(200).json({ success: true });
});

// Apply auth middleware to all resume routes
router.use(authenticateToken as any);

router.post('/upload', (req: AuthRequest, res: any) => {
  uploadCloudinary.single('file')(req, res, async (err) => {
    if (err) {
      console.error("Multer Error:", err);
      return res.status(500).json({ error: 'Multer upload failed', details: err.message || err });
    }
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const user = req.user!;
    
    const port = process.env.PORT || 5000;
    const isProd = process.env.NODE_ENV === 'production';
    const baseUrl = isProd ? `https://${req.get('host')}` : `http://127.0.0.1:${port}`;
    const localUrl = `${baseUrl}/uploads/${req.file.filename}`;

    // Create resume in MongoDB (keeping 'cloudinaryUrl' field name for schema compatibility)
    const resume = new Resume({
      filename: req.file.originalname,
      cloudinaryUrl: localUrl, 
      rawText: "Pending extraction...", 
      status: 'PENDING',
      uploadedBy: user.userId,
      organizationId: user.organizationId
    });

    await resume.save();

    res.status(202).json({ 
      message: "Upload successful, processing started", 
      id: resume._id,
      cloudinaryUrl: localUrl
    });

    // Notify clients that a new resume is pending
    io.emit('resume_status_update', { id: resume._id, status: "PENDING" });

    // Trigger AI Service Pipeline (Sprint 3)
    try {
      // Don't await this, let it run in the background
      const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
      axios.post(`${aiServiceUrl}/api/process`, {
        resume_id: resume._id.toString(),
        cloudinary_url: resume.cloudinaryUrl,
        filename: resume.filename
      }, {
        headers: {
          'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key'
        }
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

router.delete('/:id', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const resumeId = req.params.id;

    // Delete from MongoDB (ensure the user's organization owns it)
    const result = await Resume.deleteOne({ _id: resumeId, organizationId: user.organizationId });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Resume not found or unauthorized' });
    }

    res.status(200).json({ message: 'Resume deleted successfully' });
  } catch (error) {
    console.error("Delete resume error:", error);
    res.status(500).json({ error: 'Failed to delete resume' });
  }
});

export default router;
