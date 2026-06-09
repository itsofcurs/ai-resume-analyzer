import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Resume } from '../models/Resume';
import axios from 'axios';

const router = express.Router();

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'default-internal-key';

// @route   POST /api/success/predict
// @desc    Generate a candidate success prediction
// @access  Private
router.post('/predict', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    const { resumeId } = req.body;
    
    if (!resumeId) {
      return res.status(400).json({ error: 'resumeId is required' });
    }

    // Verify ownership
    const resume = await Resume.findOne({ _id: resumeId, organizationId: req.user!.organizationId });
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    // Call Python AI Service
    const response = await axios.post(
      `${PYTHON_SERVICE_URL}/api/predict-success`,
      { resume_id: resumeId },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': INTERNAL_API_KEY,
        },
        timeout: 120000, // 2 mins timeout
      }
    );

    if (response.data?.error) {
      return res.status(500).json({ error: response.data.error });
    }

    // Return the updated resume (the Python service already saved it to DB)
    const updatedResume = await Resume.findById(resumeId);
    
    return res.status(200).json({ successPrediction: updatedResume?.successPrediction });
  } catch (error: any) {
    console.error('Success prediction error:', error.message);
    if (error.response?.data) {
       console.error('Python Service Error:', error.response.data);
       return res.status(error.response.status || 500).json({ error: error.response.data.detail || 'AI Service Error' });
    }
    return res.status(500).json({ error: 'Failed to generate success prediction.' });
  }
});

export default router;
