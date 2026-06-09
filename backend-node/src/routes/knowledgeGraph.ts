import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { Resume } from '../models/Resume';
import { redisClient } from '../server';
import axios from 'axios';

const router = express.Router();

interface AuthRequest extends express.Request {
  user?: any;
}

const getOrgCacheKey = (req: AuthRequest, prefix: string) => {
  return `${prefix}:${req.user?.organizationId}`;
};

const CACHE_TTL = 3600;

// POST /api/graph/generate
router.post('/generate', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    const { resumeId } = req.body;
    if (!resumeId) {
      return res.status(400).json({ error: 'resumeId is required' });
    }

    const aiServiceUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
    
    // Non-blocking call to AI Service to trigger generation
    axios.post(`${aiServiceUrl}/api/knowledge-graph/generate`, {
      resume_id: resumeId,
      organization_id: req.user.organizationId
    }).catch(err => console.error("Failed to trigger knowledge graph generation in AI service", err.message));

    res.json({
      success: true,
      message: "Knowledge Graph generation started",
      resumeId
    });
  } catch (error: any) {
    console.error('Error generating knowledge graph:', error.message);
    res.status(500).json({ error: 'Failed to generate knowledge graph' });
  }
});

// GET /api/graph/clusters
router.get('/clusters', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;
    const cacheKey = getOrgCacheKey(req, 'graph_clusters');

    if (req.query.refresh !== 'true') {
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached.toString()));
    }

    const clusterDistribution = await Resume.aggregate([
      { $match: { organizationId: orgId, "knowledgeGraph.candidateCluster": { $exists: true } } },
      { $group: { _id: "$knowledgeGraph.candidateCluster", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const hiddenTalents = await Resume.aggregate([
      { $match: { organizationId: orgId, "knowledgeGraph.hiddenTalents": { $exists: true } } },
      { $unwind: "$knowledgeGraph.hiddenTalents" },
      { $group: { _id: "$knowledgeGraph.hiddenTalents", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 15 }
    ]);
    
    const topConnectedSkills = await Resume.aggregate([
      { $match: { organizationId: orgId, "knowledgeGraph.connectedSkills": { $exists: true } } },
      { $unwind: "$knowledgeGraph.connectedSkills" },
      { $group: { _id: "$knowledgeGraph.connectedSkills.skill", weight: { $sum: "$knowledgeGraph.connectedSkills.weight" } } },
      { $sort: { weight: -1 } },
      { $limit: 15 }
    ]);

    const highestGraphScoreCandidates = await Resume.find(
      { organizationId: orgId, "knowledgeGraph.graphScore": { $exists: true } },
      { candidateName: 1, "knowledgeGraph.graphScore": 1, "knowledgeGraph.candidateCluster": 1 }
    ).sort({ "knowledgeGraph.graphScore": -1 }).limit(10);

    const data = {
      clusterDistribution: clusterDistribution.map(c => ({ cluster: c._id, count: c.count })),
      hiddenTalents: hiddenTalents.map(h => ({ talent: h._id, count: h.count })),
      connectedSkills: topConnectedSkills.map(s => ({ skill: s._id, weight: s.weight })),
      highestScoring: highestGraphScoreCandidates
    };

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
    res.json(data);
  } catch (error: any) {
    console.error('Graph Clusters Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch cluster analytics data' });
  }
});

// GET /api/graph/similar/:resumeId
router.get('/similar/:resumeId', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    const { resumeId } = req.params;
    const resume = await Resume.findOne({ _id: resumeId, organizationId: req.user.organizationId });
    
    if (!resume || !resume.knowledgeGraph || !resume.knowledgeGraph.similarCandidates) {
      return res.status(404).json({ error: 'No similar candidates found' });
    }

    const similarIds = resume.knowledgeGraph.similarCandidates.map(c => c.resumeId);
    const similarDocs = await Resume.find(
      { _id: { $in: similarIds } },
      { candidateName: 1, "knowledgeGraph.candidateCluster": 1, "knowledgeGraph.hiddenTalents": 1, "knowledgeGraph.graphScore": 1 }
    );
    
    const enriched = resume.knowledgeGraph.similarCandidates.map(c => {
      const match = similarDocs.find(d => d._id.toString() === c.resumeId);
      return {
        ...c,
        candidateName: match?.candidateName,
        cluster: match?.knowledgeGraph?.candidateCluster,
        graphScore: match?.knowledgeGraph?.graphScore
      };
    });

    res.json(enriched.sort((a, b) => b.similarityScore - a.similarityScore));
  } catch (error: any) {
    console.error('Error fetching similar candidates:', error.message);
    res.status(500).json({ error: 'Failed to fetch similar candidates' });
  }
});

// GET /api/graph/:resumeId
router.get('/:resumeId', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    const { resumeId } = req.params;
    const resume = await Resume.findOne({ _id: resumeId, organizationId: req.user.organizationId });
    
    if (!resume) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    if (!resume.knowledgeGraph) {
      return res.status(404).json({ error: 'Knowledge graph not generated for this resume yet' });
    }

    res.json(resume.knowledgeGraph);
  } catch (error: any) {
    console.error('Error fetching knowledge graph:', error.message);
    res.status(500).json({ error: 'Failed to fetch knowledge graph' });
  }
});

export default router;
