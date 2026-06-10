import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../server';
import { logger } from '../lib/telemetry';

export const quotaMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user || !req.user.organizationId) {
    return res.status(401).json({ error: 'Unauthorized: Organization context required for quota check.' });
  }

  try {
    const orgId = req.user.organizationId;
    
    const quota = await prisma.usageQuota.findUnique({
      where: { organizationId: orgId }
    });

    if (!quota) {
      logger.warn(`No quota found for org ${orgId}. Denying access.`);
      return res.status(403).json({ error: 'No active usage quota found for organization.' });
    }

    if (quota.apiUsage >= quota.apiLimit && quota.apiLimit !== -1) { // -1 means unlimited
      logger.warn(`Quota exceeded for org ${orgId}: ${quota.apiUsage}/${quota.apiLimit}`);
      return res.status(429).json({ 
        error: 'Usage quota exceeded. Please upgrade your enterprise plan.',
        usage: quota.apiUsage,
        limit: quota.apiLimit
      });
    }

    // Pass quota to request so routes can increment it if they succeed
    (req as any).quota = quota;
    next();
  } catch (err: any) {
    logger.error(`Quota check failed: ${err.message}`);
    res.status(500).json({ error: 'Internal server error checking quota.' });
  }
};

export const incrementApiUsage = async (organizationId: string, amount: number = 1) => {
  try {
    await prisma.usageQuota.update({
      where: { organizationId },
      data: { apiUsage: { increment: amount } }
    });
  } catch (err) {
    logger.error(`Failed to increment API usage for org ${organizationId}: ${err}`);
  }
};
