import express from 'express';
import { authenticateToken, AuthRequest, requireExecutiveRole } from '../middleware/auth';
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
      if (cached) return res.json(JSON.parse(cached.toString()));
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
      if (cached) return res.json(JSON.parse(cached.toString()));
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
      if (cached) return res.json(JSON.parse(cached.toString()));
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

// 4. Skills Intelligence (Phase 3B)
router.get('/skills', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;
    const cacheKey = getOrgCacheKey(req, 'analytics_skills_graph');

    if (req.query.refresh !== 'true') {
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached.toString()));
    }

    // Top Technical Skills
    const topTechnicalSkills = await Resume.aggregate([
      { $match: { organizationId: orgId, "skillGraph.technicalSkills": { $exists: true } } },
      { $unwind: "$skillGraph.technicalSkills" },
      { $group: { 
          _id: "$skillGraph.technicalSkills.skill", 
          count: { $sum: 1 },
          avgScore: { $avg: "$skillGraph.technicalSkills.score" },
          totalEvidence: { $sum: "$skillGraph.technicalSkills.evidenceCount" }
      }},
      { $sort: { totalEvidence: -1, avgScore: -1 } },
      { $limit: 15 }
    ]);

    // Top Soft Skills
    const topSoftSkills = await Resume.aggregate([
      { $match: { organizationId: orgId, "skillGraph.softSkills": { $exists: true } } },
      { $unwind: "$skillGraph.softSkills" },
      { $group: { 
          _id: "$skillGraph.softSkills.skill", 
          count: { $sum: 1 },
          avgScore: { $avg: "$skillGraph.softSkills.score" },
          totalEvidence: { $sum: "$skillGraph.softSkills.evidenceCount" }
      }},
      { $sort: { avgScore: -1 } },
      { $limit: 10 }
    ]);

    // Common Weaknesses
    const commonWeaknesses = await Resume.aggregate([
      { $match: { organizationId: orgId, "skillGraph.weaknesses": { $exists: true } } },
      { $unwind: "$skillGraph.weaknesses" },
      { $group: { _id: "$skillGraph.weaknesses", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const data = {
      topTechnicalSkills: topTechnicalSkills.map(s => ({ name: s._id, count: s.count, avgScore: Math.round(s.avgScore), evidence: s.totalEvidence })),
      topSoftSkills: topSoftSkills.map(s => ({ name: s._id, count: s.count, avgScore: Math.round(s.avgScore), evidence: s.totalEvidence })),
      commonSkillGaps: commonWeaknesses.map(s => ({ name: s._id, count: s.count })),
    };

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
    res.json(data);
  } catch (error) {
    console.error('Skills Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch skill metrics' });
  }
});

// 5. Success Predictions
router.get('/success', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;
    const cacheKey = getOrgCacheKey(req, 'analytics_success');

    if (req.query.refresh !== 'true') {
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached.toString()));
    }

    const result = await Resume.aggregate([
      { $match: { organizationId: orgId, successPrediction: { $exists: true } } },
      {
        $facet: {
          metrics: [
            {
              $group: {
                _id: null,
                averageSuccessProbability: { $avg: '$successPrediction.successProbability' },
                averageCulturalFit: { $avg: '$successPrediction.culturalFit' },
                futureLeadersPipeline: {
                  $sum: { $cond: [{ $in: ['$successPrediction.leadershipPotential', ['HIGH', 'EXCEPTIONAL']] }, 1, 0] }
                },
                highPotentialCandidates: {
                  $sum: { $cond: [{ $gte: ['$successPrediction.successProbability', 80] }, 1, 0] }
                }
              }
            }
          ],
          retentionRiskDistribution: [
            {
              $group: {
                _id: '$successPrediction.retentionRisk',
                count: { $sum: 1 }
              }
            }
          ],
          learningAgilityDistribution: [
             {
               $bucket: {
                 groupBy: "$successPrediction.learningAgility",
                 boundaries: [0, 50, 70, 85, 101],
                 default: "Unknown",
                 output: { count: { $sum: 1 } }
               }
             }
          ],
           culturalFitDistribution: [
             {
               $bucket: {
                 groupBy: "$successPrediction.culturalFit",
                 boundaries: [0, 50, 80, 101],
                 default: "Unknown",
                 output: { count: { $sum: 1 } }
               }
             }
           ],
           successVsCultureCorrelation: [
             {
               $project: {
                 success: '$successPrediction.successProbability',
                 culture: '$successPrediction.culturalFit'
               }
             },
             { $match: { success: { $ne: null }, culture: { $ne: null } } }
           ]
        }
      }
    ]);

    const data = {
      metrics: result[0].metrics[0] || { averageSuccessProbability: 0, averageCulturalFit: 0, futureLeadersPipeline: 0, highPotentialCandidates: 0 },
      retentionRiskDistribution: result[0].retentionRiskDistribution,
      learningAgilityDistribution: result[0].learningAgilityDistribution,
      culturalFitDistribution: result[0].culturalFitDistribution,
      successVsCultureCorrelation: result[0].successVsCultureCorrelation
    };
    
    // Clean up metrics._id
    if (data.metrics._id !== undefined) delete data.metrics._id;
    // Round
    data.metrics.averageSuccessProbability = Math.round(data.metrics.averageSuccessProbability || 0);
    data.metrics.averageCulturalFit = Math.round(data.metrics.averageCulturalFit || 0);

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
    res.json(data);
  } catch (error) {
    console.error('Success Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch success metrics' });
  }
});

// 6. Authenticity Metrics
router.get('/authenticity', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;
    const cacheKey = getOrgCacheKey(req, 'analytics_authenticity');

    if (req.query.refresh !== 'true') {
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached.toString()));
    }

    const result = await Resume.aggregate([
      { $match: { organizationId: orgId, answerAuthenticity: { $exists: true } } },
      {
        $facet: {
          metrics: [
            {
              $group: {
                _id: null,
                averageAuthenticityScore: { $avg: '$answerAuthenticity.authenticityScore' },
                highRiskInterviews: {
                  $sum: { $cond: [{ $eq: ['$answerAuthenticity.copyPasteRisk', 'HIGH'] }, 1, 0] }
                },
                aiAssistedCandidates: {
                  $sum: { $cond: [{ $gte: ['$answerAuthenticity.aiGeneratedProbability', 70] }, 1, 0] }
                }
              }
            }
          ],
          similarityDistribution: [
            {
              $bucket: {
                groupBy: "$answerAuthenticity.plagiarismSimilarity",
                boundaries: [0, 20, 50, 80, 101],
                default: "Unknown",
                output: { count: { $sum: 1 } }
              }
            }
          ]
        }
      }
    ]);

    const data = {
      metrics: result[0].metrics[0] || { averageAuthenticityScore: 0, highRiskInterviews: 0, aiAssistedCandidates: 0 },
      similarityDistribution: result[0].similarityDistribution
    };
    
    if (data.metrics._id !== undefined) delete data.metrics._id;
    data.metrics.averageAuthenticityScore = Math.round(data.metrics.averageAuthenticityScore || 0);

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
    res.json(data);
  } catch (error) {
    console.error('Authenticity Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch authenticity metrics' });
  }
});

// 7. Voice/Video Media Metrics
router.get('/media', authenticateToken, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;
    const cacheKey = getOrgCacheKey(req, 'analytics_media');

    if (req.query.refresh !== 'true') {
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached.toString()));
    }

    const result = await Resume.aggregate([
      { $match: { organizationId: orgId, 'voiceVideoAnalysis.0': { $exists: true } } },
      { $unwind: '$voiceVideoAnalysis' },
      {
        $group: {
          _id: null,
          averageCommunication: { $avg: '$voiceVideoAnalysis.communicationScore' },
          averageLeadership: { $avg: '$voiceVideoAnalysis.leadershipPresenceScore' },
          averageIntegrity: { $avg: '$voiceVideoAnalysis.interviewIntegrityScore' },
          averageAuthenticity: { $avg: '$voiceVideoAnalysis.authenticityScore' },
          totalRoundsAnalyzed: { $sum: 1 }
        }
      }
    ]);

    const data = result[0] || { 
      averageCommunication: 0, 
      averageLeadership: 0, 
      averageIntegrity: 0, 
      averageAuthenticity: 0,
      totalRoundsAnalyzed: 0
    };
    
    if (data._id !== undefined) delete data._id;
    
    // Round
    data.averageCommunication = Math.round(data.averageCommunication || 0);
    data.averageLeadership = Math.round(data.averageLeadership || 0);
    data.averageIntegrity = Math.round(data.averageIntegrity || 0);
    data.averageAuthenticity = Math.round(data.averageAuthenticity || 0);

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
    res.json(data);
  } catch (error) {
    console.error('Media Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch media metrics' });
  }
});

// 8. Executive Overview
router.get('/executive', authenticateToken, requireExecutiveRole, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;
    const cacheKey = getOrgCacheKey(req, 'analytics_executive');

    if (req.query.refresh !== 'true') {
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached.toString()));
    }

    // High level aggregation
    const result = await Resume.aggregate([
      { $match: { organizationId: orgId } },
      {
        $group: {
          _id: null,
          totalCandidates: { $sum: 1 },
          avgTrustScore: { $avg: '$fraudAnalysis.trustScore' },
          avgSuccessProbability: { $avg: '$successPrediction.successProbability' },
          highFraudRiskCount: {
            $sum: { $cond: [{ $lt: ['$fraudAnalysis.trustScore', 60] }, 1, 0] }
          },
          avgAtsScore: { $avg: '$scores.total' },
          avgFlightRisk: { $avg: '$predictiveHiring.flightRisk' },
          avgOfferAcceptance: { $avg: '$predictiveHiring.offerAcceptance' }
        }
      }
    ]);

    const data = result[0] || {
      totalCandidates: 0,
      avgTrustScore: 0,
      avgSuccessProbability: 0,
      highFraudRiskCount: 0,
      avgAtsScore: 0,
      avgFlightRisk: 0,
      avgOfferAcceptance: 0
    };

    if (data._id !== undefined) delete data._id;

    data.avgTrustScore = Math.round(data.avgTrustScore || 0);
    data.avgSuccessProbability = Math.round(data.avgSuccessProbability || 0);
    data.avgAtsScore = Math.round((data.avgAtsScore || 0) * 100);
    data.avgFlightRisk = Math.round(data.avgFlightRisk || 0);
    data.avgOfferAcceptance = Math.round(data.avgOfferAcceptance || 0);

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
    res.json(data);
  } catch (error) {
    console.error('Executive Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch executive metrics' });
  }
});

// Phase 4C Module 6: Workforce Intelligence
router.get('/workforce', authenticateToken, requireExecutiveRole, async (req: AuthRequest, res: any) => {
  try {
    if (!req.user?.organizationId) return res.status(403).json({ error: 'Organization ID required' });
    const orgId = req.user.organizationId;
    const cacheKey = getOrgCacheKey(req, 'analytics_workforce');

    if (req.query.refresh !== 'true') {
      const cached = await redisClient.get(cacheKey);
      if (cached) return res.json(JSON.parse(cached.toString()));
    }

    // High level aggregation for Workforce Intelligence
    const result = await Resume.aggregate([
      { $match: { organizationId: orgId } },
      {
        $group: {
          _id: null,
          totalEmployees: { $sum: { $cond: [{ $eq: ['$pipelineStage', 'Hired'] }, 1, 0] } },
          totalCandidates: { $sum: 1 },
          avgFlightRisk: { $avg: '$predictiveHiring.flightRisk' },
          diversityScore: { $sum: 0 }, // Removed hardcoded diversity score, requires real aggregation implementation
        }
      }
    ]);

    // Top Weaknesses across all candidates/hires
    const commonWeaknesses = await Resume.aggregate([
      { $match: { organizationId: orgId, "skillGraph.weaknesses": { $exists: true } } },
      { $unwind: "$skillGraph.weaknesses" },
      { $group: { _id: "$skillGraph.weaknesses", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const data = {
      metrics: result[0] || {
        totalEmployees: 0,
        totalCandidates: 0,
        avgFlightRisk: 0,
        diversityScore: null
      },
      skillGaps: commonWeaknesses.map(s => ({ skill: s._id, count: s.count })),
      attritionRisk: Math.round(result[0]?.avgFlightRisk || 0)
    };

    if (data.metrics._id !== undefined) delete data.metrics._id;
    data.metrics.avgFlightRisk = Math.round(data.metrics.avgFlightRisk || 0);
    if (data.metrics.diversityScore === 0) data.metrics.diversityScore = null;

    await redisClient.setEx(cacheKey, CACHE_TTL, JSON.stringify(data));
    res.json(data);
  } catch (error) {
    console.error('Workforce Analytics Error:', error);
    res.status(500).json({ error: 'Failed to fetch workforce intelligence metrics' });
  }
});

export default router;
