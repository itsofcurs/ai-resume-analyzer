import { Router } from 'express';
import { Resume } from '../models/Resume';
import { Notification } from '../models/Notification';
import { authenticateToken, AuthRequest, requireExecutiveRole } from '../middleware/auth';
import { io, prisma } from '../server';
import axios from 'axios';
import { autonomousQueue } from '../queues/autonomousQueue';

const router = Router();

router.use(authenticateToken as any);

// GET /api/pipeline/assignable-users - Fetch users for recruiter assignment
router.get('/assignable-users', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const users = await prisma.user.findMany({
      where: { organizationId: user.organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true
      }
    });
    res.json(users);
  } catch (error) {
    console.error("Fetch assignable users error:", error);
    res.status(500).json({ error: 'Failed to fetch assignable users' });
  }
});

// GET /api/pipeline - Fetch candidates grouped by pipelineStage
router.get('/', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { stage, priority, tags, owner, search, atsScoreMin, trustScoreMin } = req.query;

    const query: any = { organizationId: user.organizationId };

    if (stage) query.pipelineStage = stage;
    if (priority) query.priority = priority;
    if (owner) query.currentOwner = owner;
    
    if (tags) {
      const tagArray = (tags as string).split(',');
      query.tags = { $all: tagArray };
    }

    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      query.$or = [
        { candidateName: searchRegex },
        { candidateEmail: searchRegex },
        { 'skillGraph.technicalSkills.skill': searchRegex }
      ];
    }

    if (atsScoreMin) {
      query['atsScores.overallScore'] = { $gte: Number(atsScoreMin) };
    }

    if (trustScoreMin) {
      query['fraudAnalysis.trustScore'] = { $gte: Number(trustScoreMin) };
    }

    const candidates = await Resume.find(query)
      .select('candidateName candidateEmail pipelineStage priority currentOwner tags atsScores.overallScore fraudAnalysis.trustScore successPrediction.successProbability createdAt stageEnteredAt')
      .sort({ createdAt: -1 });

    res.json(candidates);
  } catch (error) {
    console.error("Fetch pipeline candidates error:", error);
    res.status(500).json({ error: 'Failed to fetch pipeline candidates' });
  }
});

// POST /api/pipeline/move - Update candidate stage (supports bulk)
router.post('/move', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { candidateIds, newStage, sourceSocketId } = req.body;

    if (!candidateIds || !Array.isArray(candidateIds) || !newStage) {
      return res.status(400).json({ error: 'Missing candidateIds array or newStage' });
    }

    const historyEntry = {
      stage: newStage,
      changedAt: new Date(),
      changedBy: user.userId
    };

    const activityEntry = {
      action: 'MOVED_STAGE',
      performedBy: user.userId,
      timestamp: new Date(),
      metadata: { newStage }
    };

    await Resume.updateMany(
      { _id: { $in: candidateIds }, organizationId: user.organizationId },
      { 
        $set: { 
          pipelineStage: newStage,
          stageEnteredAt: new Date(),
          statusUpdatedAt: new Date()
        },
        $push: { 
          pipelineHistory: historyEntry,
          activityLog: activityEntry
        }
      }
    );

    io.to(user.organizationId).emit('PIPELINE_UPDATED', { candidateIds, newStage, sourceSocketId });

    // Phase 5A: Queue Autonomous Agent asynchronously on key pipeline stages
    const triggerStages = ['Screening', 'Interview Scheduled', 'Offer Extended'];
    if (triggerStages.includes(newStage)) {
      for (const id of candidateIds) {
        await autonomousQueue.add('agent-pipeline-trigger', {
          candidateId: id,
          triggerSource: `stage_change_${newStage.replace(/\s+/g, '_').toLowerCase()}`
        }, {
          jobId: `autonomous-${id}-${Date.now()}`
        });
      }
    }

    res.json({ success: true, message: `Moved ${candidateIds.length} candidates to ${newStage}` });
  } catch (error) {
    console.error("Pipeline move error:", error);
    res.status(500).json({ error: 'Failed to move candidates' });
  }
});

// POST /api/pipeline/assign - Update currentOwner (supports bulk)
router.post('/assign', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { candidateIds, newOwner, sourceSocketId } = req.body;

    if (!candidateIds || !Array.isArray(candidateIds) || !newOwner) {
      return res.status(400).json({ error: 'Missing candidateIds array or newOwner' });
    }

    const activityEntry = {
      action: 'ASSIGNED_RECRUITER',
      performedBy: user.userId,
      timestamp: new Date(),
      metadata: { newOwner }
    };

    await Resume.updateMany(
      { _id: { $in: candidateIds }, organizationId: user.organizationId },
      { 
        $set: { currentOwner: newOwner, statusUpdatedAt: new Date() },
        $push: { activityLog: activityEntry }
      }
    );

    // Create notification for the new owner
    if (newOwner !== user.userId) {
      await Notification.create({
        recipientId: newOwner,
        organizationId: user.organizationId,
        type: 'ASSIGNED',
        message: `You have been assigned ${candidateIds.length} candidate(s).`,
      });
      io.to(user.organizationId).emit(`NOTIFICATION_${newOwner}`, { type: 'ASSIGNED' });
    }

    io.to(user.organizationId).emit('PIPELINE_ASSIGNMENT_UPDATED', { candidateIds, sourceSocketId });
    io.to(user.organizationId).emit('PIPELINE_UPDATED', { candidateIds, sourceSocketId });

    res.json({ success: true, message: `Assigned ${candidateIds.length} candidates` });
  } catch (error) {
    console.error("Pipeline assign error:", error);
    res.status(500).json({ error: 'Failed to assign candidates' });
  }
});

// POST /api/pipeline/tags - Add/remove tags (supports bulk)
router.post('/tags', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { candidateIds, tags, action, sourceSocketId } = req.body; // action: 'add' or 'remove'

    if (!candidateIds || !Array.isArray(candidateIds) || !tags || !Array.isArray(tags)) {
      return res.status(400).json({ error: 'Missing required arrays' });
    }

    const updateOp = action === 'remove' 
      ? { 
          $pullAll: { tags: tags },
          $push: { 
            activityLog: { action: 'REMOVED_TAGS', performedBy: user.userId, timestamp: new Date(), metadata: { tags } } 
          }
        }
      : { 
          $addToSet: { tags: { $each: tags } },
          $push: { 
            activityLog: { action: 'ADDED_TAGS', performedBy: user.userId, timestamp: new Date(), metadata: { tags } } 
          }
        };

    await Resume.updateMany(
      { _id: { $in: candidateIds }, organizationId: user.organizationId },
      updateOp as any
    );

    io.to(user.organizationId).emit('PIPELINE_UPDATED', { candidateIds, sourceSocketId });
    res.json({ success: true });
  } catch (error) {
    console.error("Pipeline tags error:", error);
    res.status(500).json({ error: 'Failed to update tags' });
  }
});

// POST /api/pipeline/priority - Update priority level
router.post('/priority', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { candidateIds, priority, sourceSocketId } = req.body;

    if (!candidateIds || !Array.isArray(candidateIds) || !priority) {
      return res.status(400).json({ error: 'Missing candidateIds array or priority' });
    }

    const activityEntry = {
      action: 'CHANGED_PRIORITY',
      performedBy: user.userId,
      timestamp: new Date(),
      metadata: { priority }
    };

    await Resume.updateMany(
      { _id: { $in: candidateIds }, organizationId: user.organizationId },
      { 
        $set: { priority: priority, statusUpdatedAt: new Date() },
        $push: { activityLog: activityEntry }
      }
    );

    io.to(user.organizationId).emit('PIPELINE_UPDATED', { candidateIds, sourceSocketId });
    res.json({ success: true });
  } catch (error) {
    console.error("Pipeline priority error:", error);
    res.status(500).json({ error: 'Failed to update priority' });
  }
});

// POST /api/pipeline/notes - Add recruiter notes
router.post('/notes', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const { candidateId, text, sourceSocketId } = req.body;

    if (!candidateId || !text) {
      return res.status(400).json({ error: 'Missing candidateId or text' });
    }

    const newNote = {
      text,
      addedBy: user.userId,
      addedAt: new Date()
    };

    const activityEntry = {
      action: 'ADDED_NOTE',
      performedBy: user.userId,
      timestamp: new Date()
    };

    await Resume.updateOne(
      { _id: candidateId, organizationId: user.organizationId },
      { 
        $push: { recruiterNotes: newNote, activityLog: activityEntry },
        $set: { statusUpdatedAt: new Date() } 
      }
    );

    io.to(user.organizationId).emit('PIPELINE_NOTE_ADDED', { candidateIds: [candidateId], sourceSocketId });
    io.to(user.organizationId).emit('PIPELINE_UPDATED', { candidateIds: [candidateId], sourceSocketId });
    res.json({ success: true, note: newNote });
  } catch (error) {
    console.error("Pipeline notes error:", error);
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// GET /api/pipeline/stuck - Auto-Stuck Candidate Detection
router.get('/stuck', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    
    // Define SLAs per stage in milliseconds
    const SLA_DAYS = {
      'Applied': 3,
      'Screening': 5,
      'Shortlisted': 4,
      'Interview Scheduled': 7,
      'Interview Completed': 3,
      'Offer Extended': 5
    };

    const candidates = await Resume.find({
      organizationId: user.organizationId,
      pipelineStage: { $nin: ['Hired', 'Rejected'] }
    }).select('candidateName pipelineStage stageEnteredAt priority');

    const now = new Date().getTime();
    const stuckCandidates = candidates.map(c => {
      const daysInStage = Math.floor((now - new Date(c.stageEnteredAt || c.createdAt).getTime()) / (1000 * 3600 * 24));
      // @ts-ignore
      const slaLimit = SLA_DAYS[c.pipelineStage] || 7;
      
      return {
        id: c._id,
        name: c.candidateName,
        stage: c.pipelineStage,
        daysInStage,
        slaLimit,
        isStuck: daysInStage > slaLimit,
        priority: c.priority
      };
    }).filter(c => c.isStuck).sort((a, b) => b.daysInStage - a.daysInStage);

    res.json(stuckCandidates);
  } catch (error) {
    console.error("Pipeline stuck candidate detection error:", error);
    res.status(500).json({ error: 'Failed to detect stuck candidates' });
  }
});

// GET /api/pipeline/recommendations - Smart Stage Recommendations
router.get('/recommendations', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    
    // Find candidates in early stages with high scores
    const candidates = await Resume.find({
      organizationId: user.organizationId,
      pipelineStage: { $in: ['Applied', 'Screening'] },
      'atsScores.overallScore': { $gte: 85 },
      'fraudAnalysis.trustScore': { $gte: 85 }
    }).select('candidateName pipelineStage atsScores.overallScore fraudAnalysis.trustScore successPrediction.successProbability');

    const recommendations = candidates.map(c => {
      return {
        id: c._id,
        name: c.candidateName,
        currentStage: c.pipelineStage,
        atsScore: c.atsScores?.overallScore || 0,
        trustScore: c.fraudAnalysis?.trustScore || 0,
        successProbability: c.successPrediction?.successProbability || 0,
        recommendedStage: 'Interview Scheduled',
        reason: 'Exceptional AI scores across ATS, Trust, and Success Prediction.'
      };
    }).sort((a, b) => b.atsScore - a.atsScore).slice(0, 10); // Top 10 recommendations

    res.json(recommendations);
  } catch (error) {
    console.error("Pipeline recommendations error:", error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
});

// GET /api/pipeline/analytics - Pipeline Funnel and Velocity
router.get('/analytics', async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;

    const pipelineCounts = await Resume.aggregate([
      { $match: { organizationId: user.organizationId } },
      { $group: { _id: "$pipelineStage", count: { $sum: 1 } } }
    ]);

    const stageDistribution = pipelineCounts.map(item => ({
      stage: item._id,
      count: item.count
    }));

    const funnelData = [
      { name: 'Applied', value: stageDistribution.find(s => s.stage === 'Applied')?.count || 0 },
      { name: 'Screening', value: stageDistribution.find(s => s.stage === 'Screening')?.count || 0 },
      { name: 'Interview Scheduled', value: stageDistribution.find(s => s.stage === 'Interview Scheduled')?.count || 0 },
      { name: 'Interview Completed', value: stageDistribution.find(s => s.stage === 'Interview Completed')?.count || 0 },
      { name: 'Offer Extended', value: stageDistribution.find(s => s.stage === 'Offer Extended')?.count || 0 },
      { name: 'Hired', value: stageDistribution.find(s => s.stage === 'Hired')?.count || 0 }
    ];

    // Pipeline history aggregations for time in stage
    const timeInStageAgg = await Resume.aggregate([
      { $match: { organizationId: user.organizationId } },
      { $project: { pipelineStage: 1, stageEnteredAt: 1, createdAt: 1 } },
      { $group: {
          _id: "$pipelineStage",
          avgTime: {
            $avg: {
              $subtract: [new Date(), { $ifNull: ["$stageEnteredAt", "$createdAt"] }]
            }
          }
      }}
    ]);

    const timeData = timeInStageAgg.map(t => ({
      stage: t._id,
      days: Math.max(0, Math.round(t.avgTime / (1000 * 3600 * 24)))
    }));

    // Velocity data (Hires per week for last 4 weeks)
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    
    const velocityAgg = await Resume.aggregate([
      { $match: { 
          organizationId: user.organizationId, 
          pipelineStage: 'Hired',
          stageEnteredAt: { $gte: fourWeeksAgo }
      }},
      {
        $group: {
          _id: { $week: "$stageEnteredAt" },
          hires: { $sum: 1 }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    const velocityData = velocityAgg.map(v => ({
      week: `Week ${v._id}`,
      hires: v.hires
    }));

    res.json({
      stageDistribution,
      funnelData,
      timeData,
      velocityData
    });
  } catch (error) {
    console.error("Pipeline analytics error:", error);
    res.status(500).json({ error: 'Failed to fetch pipeline analytics' });
  }
});

export default router;
