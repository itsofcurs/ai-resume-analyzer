import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { Resume } from '../models/Resume';
import { redisClient } from '../server';

const router = express.Router();

interface AuthRequest extends express.Request {
  user?: any;
}

// Helper for caching
const getOrgCacheKey = (req: AuthRequest, prefix: string) => {
  return `${prefix}:${req.user?.organizationId}`;
};

const CACHE_TTL = 3600;

// GET /api/skills/organization
router.get('/organization', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;
    const cacheKey = getOrgCacheKey(req, 'skills_organization');

    if (req.query.refresh !== 'true') {
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached.toString()));
    }

    const topSkills = await Resume.aggregate([
      { $match: { organizationId: orgId, "skillGraph.technicalSkills": { $exists: true } } },
      { $unwind: "$skillGraph.technicalSkills" },
      { $group: { 
          _id: "$skillGraph.technicalSkills.skill", 
          avgScore: { $avg: "$skillGraph.technicalSkills.score" },
      }},
      { $sort: { avgScore: -1 } },
      { $limit: 10 }
    ]);

    const weakestSkills = await Resume.aggregate([
      { $match: { organizationId: orgId, "skillGraph.technicalSkills": { $exists: true } } },
      { $unwind: "$skillGraph.technicalSkills" },
      { $group: { 
          _id: "$skillGraph.technicalSkills.skill", 
          avgScore: { $avg: "$skillGraph.technicalSkills.score" },
      }},
      { $sort: { avgScore: 1 } },
      { $limit: 10 }
    ]);

    const strongestCompetencies = await Resume.aggregate([
      { $match: { organizationId: orgId, "skillGraph.softSkills": { $exists: true } } },
      { $unwind: "$skillGraph.softSkills" },
      { $group: { 
          _id: "$skillGraph.softSkills.skill", 
          avgScore: { $avg: "$skillGraph.softSkills.score" },
      }},
      { $sort: { avgScore: -1 } },
      { $limit: 10 }
    ]);

    // Competency Distribution
    const techDistribution = await Resume.aggregate([
      { $match: { organizationId: orgId, "skillGraph.competencyLevel.technical": { $exists: true } } },
      { $group: { _id: "$skillGraph.competencyLevel.technical", count: { $sum: 1 } } }
    ]);
    
    const leadershipDistribution = await Resume.aggregate([
      { $match: { organizationId: orgId, "skillGraph.competencyLevel.leadership": { $exists: true } } },
      { $group: { _id: "$skillGraph.competencyLevel.leadership", count: { $sum: 1 } } }
    ]);

    const commDistribution = await Resume.aggregate([
      { $match: { organizationId: orgId, "skillGraph.competencyLevel.communication": { $exists: true } } },
      { $group: { _id: "$skillGraph.competencyLevel.communication", count: { $sum: 1 } } }
    ]);

    const probDistribution = await Resume.aggregate([
      { $match: { organizationId: orgId, "skillGraph.competencyLevel.problemSolving": { $exists: true } } },
      { $group: { _id: "$skillGraph.competencyLevel.problemSolving", count: { $sum: 1 } } }
    ]);

    // Skill Cluster Distribution
    const clusterDistribution = await Resume.aggregate([
      { $match: { organizationId: orgId, "skillGraph.skillClusters": { $exists: true } } },
      { $unwind: "$skillGraph.skillClusters" },
      { $group: { 
          _id: "$skillGraph.skillClusters.clusterName", 
          avgScore: { $avg: "$skillGraph.skillClusters.score" },
          count: { $sum: 1 }
      }},
      { $sort: { count: -1 } }
    ]);

    const data = {
      topSkills: topSkills.map(s => ({ skill: s._id, avgScore: Math.round(s.avgScore) })),
      weakestSkills: weakestSkills.map(s => ({ skill: s._id, avgScore: Math.round(s.avgScore) })),
      strongestCompetencies: strongestCompetencies.map(s => ({ skill: s._id, avgScore: Math.round(s.avgScore) })),
      competencyDistribution: {
        technical: techDistribution.map(d => ({ level: d._id, count: d.count })),
        leadership: leadershipDistribution.map(d => ({ level: d._id, count: d.count })),
        communication: commDistribution.map(d => ({ level: d._id, count: d.count })),
        problemSolving: probDistribution.map(d => ({ level: d._id, count: d.count }))
      },
      skillClusterDistribution: clusterDistribution.map(c => ({ cluster: c._id, count: c.count, avgScore: Math.round(c.avgScore) }))
    };

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
    res.json(data);
  } catch (error: any) {
    console.error('Skills Organization Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch organization skills data' });
  }
});

// GET /api/skills/:resumeId
router.get('/:resumeId', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    const { resumeId } = req.params;
    const resume = await Resume.findOne({ _id: resumeId, organizationId: req.user.organizationId });
    
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    if (!resume.skillGraph) {
      return res.status(404).json({ error: 'Skill graph not generated for this resume yet' });
    }

    res.json(resume.skillGraph);
  } catch (error: any) {
    console.error('Error fetching skill graph:', error.message);
    res.status(500).json({ error: 'Failed to fetch skill graph' });
  }
});

export default router;
