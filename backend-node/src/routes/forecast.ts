import { Router } from 'express';
import { authenticateToken, AuthRequest, requireExecutiveRole } from '../middleware/auth';
import { Resume } from '../models/Resume';
import axios from 'axios';

const router = Router();
router.use(authenticateToken as any);

// POST /api/forecast/hiring
router.post('/hiring', requireExecutiveRole, async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const organizationId = user.organizationId;
    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

    // Aggregate basic metrics to send to AI for deep forecasting
    const pipelineStats = await Resume.aggregate([
      { $match: { organizationId } },
      { 
        $group: {
          _id: '$pipelineStage',
          count: { $sum: 1 },
          avgDaysInStage: {
            $avg: {
              $divide: [{ $subtract: [new Date(), "$stageEnteredAt"] }, 1000 * 60 * 60 * 24]
            }
          }
        }
      }
    ]);

    const historicalOutcomes = await Resume.aggregate([
      { $match: { organizationId, status: { $in: ['PROCESSED', 'FAILED'] } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          totalCandidates: { $sum: 1 },
          hires: {
            $sum: { $cond: [{ $eq: ["$pipelineStage", "Hired"] }, 1, 0] }
          },
          rejections: {
            $sum: { $cond: [{ $eq: ["$pipelineStage", "Rejected"] }, 1, 0] }
          }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);

    const response = await axios.post(`${aiServiceUrl}/api/forecast/hiring`, {
      organization_id: organizationId,
      pipeline_stats: pipelineStats,
      historical_outcomes: historicalOutcomes
    }, {
      headers: { 'x-api-key': process.env.INTERNAL_API_KEY || 'default-internal-key' },
      timeout: 30000
    });

    res.json(response.data);
  } catch (error: any) {
    console.error("Forecast hiring error:", error.message);
    res.status(500).json({ error: 'Failed to generate hiring forecast' });
  }
});

export default router;
