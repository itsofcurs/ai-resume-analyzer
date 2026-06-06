import express from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { Resume } from '../models/Resume';
import { redisClient } from '../server';

const router = express.Router();

const CACHE_TTL = 300; // 5 minutes

// Helper to check org and format cache key
const getOrgCacheKey = (req: AuthRequest, prefix: string) => {
  if (!req.user || !req.user.organizationId) {
    throw new Error('Unauthorized');
  }
  return `${prefix}:${req.user.organizationId}`;
};

// Executive Health Score Calculation
const calculateHealthScore = (metrics: any) => {
  const ats = metrics.averageATSScore || 0;
  const trust = metrics.averageTrustScore || 0;
  const interview = metrics.averageInterviewScore || 0;
  const recommendation = metrics.averageRecommendationScore || 0;
  const processingSuccess = metrics.processingSuccessRate || 0;

  const score = (0.30 * ats) + (0.25 * trust) + (0.20 * interview) + (0.15 * recommendation) + (0.10 * processingSuccess);
  
  let grade = 'D';
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 60) grade = 'C';

  return { healthScore: Math.round(score), grade };
};

// 1. Dashboard Metrics
router.get('/dashboard', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;
    const cacheKey = getOrgCacheKey(req, 'analytics_dashboard');

    if (req.query.refresh !== 'true') {
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
    }

    const matchStage = { $match: { organizationId: orgId } };

    const result = await Resume.aggregate([
      matchStage,
      {
        $facet: {
          totals: [
            {
              $group: {
                _id: null,
                totalCandidates: { $sum: 1 },
                processedCandidates: {
                  $sum: { $cond: [{ $eq: ['$status', 'PROCESSED'] }, 1, 0] }
                },
                averageATSScore: { $avg: '$atsScores.overall_score' },
                averageTrustScore: { $avg: '$fraudAnalysis.trustScore' },
                averageInterviewScore: { $avg: '$interviewEvaluation.overallScore' },
                averageRecommendationScore: { $avg: '$recommendationScore' },
                highRiskCandidates: {
                  $sum: { $cond: [{ $eq: ['$fraudAnalysis.fraudRisk', 'HIGH'] }, 1, 0] }
                },
                verifiedCandidates: {
                  $sum: { $cond: [{ $in: ['$fraudAnalysis.fraudRisk', ['LOW', 'VERIFIED']] }, 1, 0] }
                }
              }
            }
          ]
        }
      }
    ]);

    const totals = result[0].totals[0] || {
      totalCandidates: 0, processedCandidates: 0, averageATSScore: 0,
      averageTrustScore: 0, averageInterviewScore: 0, averageRecommendationScore: 0,
      highRiskCandidates: 0, verifiedCandidates: 0
    };

    const processingSuccessRate = totals.totalCandidates > 0 
      ? (totals.processedCandidates / totals.totalCandidates) * 100 
      : 0;

    const data = {
      ...totals,
      processingSuccessRate: Math.round(processingSuccessRate),
      averageATSScore: Math.round(totals.averageATSScore || 0),
      averageTrustScore: Math.round(totals.averageTrustScore || 0),
      averageInterviewScore: Math.round(totals.averageInterviewScore || 0),
    };

    const health = calculateHealthScore(data);
    const finalData = { ...data, healthScore: health.healthScore, grade: health.grade };

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(finalData));
    res.json(finalData);
  } catch (error) {
    console.error('Analytics Dashboard Error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
});

// 2. Funnel Analytics
router.get('/funnel', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;
    const cacheKey = getOrgCacheKey(req, 'analytics_funnel');

    if (req.query.refresh !== 'true') {
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
    }

    const result = await Resume.aggregate([
      { $match: { organizationId: orgId } },
      {
        $group: {
          _id: null,
          uploaded: { $sum: 1 },
          processed: { $sum: { $cond: [{ $eq: ['$status', 'PROCESSED'] }, 1, 0] } },
          shortlisted: {
            $sum: { $cond: [{ $in: ['$candidateRanking.grade', ['A+', 'A', 'B+', 'B']] }, 1, 0] }
          },
          interviewed: {
            $sum: { $cond: [{ $gt: ['$interviewEvaluation.overallScore', 0] }, 1, 0] }
          },
          verified: {
            $sum: { $cond: [{ $in: ['$fraudAnalysis.fraudRisk', ['LOW']] }, 1, 0] }
          },
          high_risk: {
            $sum: { $cond: [{ $eq: ['$fraudAnalysis.fraudRisk', 'HIGH'] }, 1, 0] }
          }
        }
      }
    ]);

    const data = result[0] || { uploaded: 0, processed: 0, shortlisted: 0, interviewed: 0, verified: 0, high_risk: 0 };
    delete data._id;

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
    res.json(data);
  } catch (error) {
    console.error('Funnel Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch funnel metrics' });
  }
});

// 3. Trends
router.get('/trends', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;
    const cacheKey = getOrgCacheKey(req, 'analytics_trends');

    if (req.query.refresh !== 'true') {
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
    }

    // Daily upload aggregation for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailyUploads = await Resume.aggregate([
      { $match: { organizationId: orgId, createdAt: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
          avgAts: { $avg: '$atsScores.overall_score' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const data = { dailyUploads };
    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
    res.json(data);
  } catch (error) {
    console.error('Trends Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch trend metrics' });
  }
});

// 4. Skills Intelligence
router.get('/skills', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;
    const cacheKey = getOrgCacheKey(req, 'analytics_skills');

    if (req.query.refresh !== 'true') {
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached));
    }

    // Candidate Extracted Skills
    const topSkillsResult = await Resume.aggregate([
      { $match: { organizationId: orgId, status: 'PROCESSED' } },
      { $unwind: "$parsedData.skills" },
      { $group: { _id: { $toLower: "$parsedData.skills" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Missing Skills
    const missingSkillsResult = await Resume.aggregate([
      { $match: { organizationId: orgId } },
      { $unwind: "$skillGapAnalysis.missingSkills" },
      { $group: { _id: { $toLower: "$skillGapAnalysis.missingSkills" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const data = {
      topSkills: topSkillsResult.map(s => ({ name: s._id, count: s.count })),
      missingSkills: missingSkillsResult.map(s => ({ name: s._id, count: s.count })),
      emergingSkills: [], // Placeholder for complex cross-job comparison
      decliningSkills: [] // Placeholder
    };

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
    res.json(data);
  } catch (error) {
    console.error('Skills Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch skill metrics' });
  }
});

export default router;
