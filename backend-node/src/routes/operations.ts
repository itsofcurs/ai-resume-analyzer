import { Router } from 'express';
import { authenticateToken, AuthRequest, requireExecutiveRole } from '../middleware/auth';
import { resumeQueue } from '../queues/resumeQueue';
import { copilotQueue } from '../queues/copilotQueue';
import { autonomousQueue } from '../queues/autonomousQueue';
import { learningQueue } from '../queues/learningQueue';
import { prisma } from '../server';

const router = Router();

router.use(authenticateToken as any);
router.use(requireExecutiveRole as any);

router.get('/metrics', async (req: AuthRequest, res: any) => {
  try {
    const orgId = req.user!.organizationId;
    
    // In a fully multi-tenant enterprise setup, we might filter queue jobs by tenant, 
    // but for the scope of the operations center, we'll fetch overall queue health 
    // and tenant-specific cost/usage.
    
    const [
      resumeCounts,
      copilotCounts,
      autonomousCounts,
      learningCounts
    ] = await Promise.all([
      resumeQueue.getJobCounts('wait', 'active', 'failed', 'delayed', 'completed'),
      copilotQueue.getJobCounts('wait', 'active', 'failed', 'delayed', 'completed'),
      autonomousQueue.getJobCounts('wait', 'active', 'failed', 'delayed', 'completed'),
      learningQueue.getJobCounts('wait', 'active', 'failed', 'delayed', 'completed')
    ]);

    const activeUsersCount = await prisma.user.count({
      where: { organizationId: orgId }
    });

    const tokenUsageLog = await prisma.aICost.aggregate({
      where: { organizationId: orgId },
      _sum: { tokensUsed: true, totalCost: true }
    });

    res.json({
      queues: {
        resumeQueue: resumeCounts.wait + resumeCounts.active,
        copilotQueue: copilotCounts.wait + copilotCounts.active,
        autonomousQueue: autonomousCounts.wait + autonomousCounts.active,
        learningQueue: learningCounts.wait + learningCounts.active,
        
        // Include failure counts for SRE visibility
        failures: {
          resumeQueue: resumeCounts.failed,
          copilotQueue: copilotCounts.failed,
          autonomousQueue: autonomousCounts.failed,
          learningQueue: learningCounts.failed
        }
      },
      telemetry: {
        activeUsers: activeUsersCount,
        tokenUsage: tokenUsageLog._sum.tokensUsed || 0,
        totalCost: tokenUsageLog._sum.totalCost || 0
      },
      health: {
        status: 'Operational',
        uptime: process.uptime()
      }
    });

  } catch (error: any) {
    console.error("Operations Metrics Error:", error);
    res.status(500).json({ error: 'Failed to retrieve operations metrics' });
  }
});

export default router;
