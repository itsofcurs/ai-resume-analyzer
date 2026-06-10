import { Router } from 'express';
import { authenticateToken, AuthRequest, requireExecutiveRole } from '../middleware/auth';
import { prisma } from '../server';

const router = Router();
router.use(authenticateToken as any);

import { getCache, setCache, CacheKeys, invalidateCache } from '../cache/cacheManager';

router.get('/analytics', requireExecutiveRole, async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const organizationId = user.organizationId;
    const cacheKey = CacheKeys.cost(organizationId);

    const cachedData = await getCache(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }
    
    // Aggregate AI costs for the organization
    const totalCosts = await prisma.aICost.aggregate({
      where: { organizationId },
      _sum: {
        tokensUsed: true,
        promptCost: true,
        completionCost: true,
        totalCost: true
      }
    });

    const workflowCosts = await prisma.aICost.groupBy({
      by: ['workflowName'],
      where: { organizationId },
      _sum: {
        totalCost: true,
        tokensUsed: true
      }
    });

    const responseData = {
      totals: {
        tokens: totalCosts._sum.tokensUsed || 0,
        prompt: totalCosts._sum.promptCost || 0,
        completion: totalCosts._sum.completionCost || 0,
        total: totalCosts._sum.totalCost || 0
      },
      byWorkflow: workflowCosts
    };

    await setCache(cacheKey, responseData, 300); // 5 minutes TTL

    res.json(responseData);
  } catch (error: any) {
    console.error("Cost analytics error:", error.message);
    res.status(500).json({ error: 'Failed to fetch AI cost analytics' });
  }
});

// Helper for logging AI costs
export const logAICost = async (
  organizationId: string,
  workflowName: string,
  tokensUsed: number,
  promptCost: number,
  completionCost: number,
  userId?: string
) => {
  try {
    await prisma.aICost.create({
      data: {
        organizationId,
        userId,
        workflowName,
        tokensUsed,
        promptCost,
        completionCost,
        totalCost: promptCost + completionCost
      }
    });

    // Invalidate cost analytics cache
    await invalidateCache(CacheKeys.cost(organizationId));
  } catch (error) {
    console.error("Failed to write AI cost:", error);
  }
};

export default router;
