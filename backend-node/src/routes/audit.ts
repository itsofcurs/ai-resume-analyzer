import { Router } from 'express';
import { authenticateToken, AuthRequest, requireExecutiveRole } from '../middleware/auth';
import { prisma } from '../server';

const router = Router();
router.use(authenticateToken as any);

router.get('/', requireExecutiveRole, async (req: AuthRequest, res: any) => {
  try {
    const user = req.user!;
    const organizationId = user.organizationId;
    
    const { page = '1', limit = '50', action, resource, startDate, endDate } = req.query;
    const pageNumber = parseInt(page as string, 10);
    const limitNumber = parseInt(limit as string, 10);

    const whereClause: any = { organizationId };
    if (action) whereClause.action = action;
    if (resource) whereClause.resource = resource;
    if (startDate || endDate) {
      whereClause.timestamp = {};
      if (startDate) whereClause.timestamp.gte = new Date(startDate as string);
      if (endDate) whereClause.timestamp.lte = new Date(endDate as string);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: whereClause,
        orderBy: { timestamp: 'desc' },
        skip: (pageNumber - 1) * limitNumber,
        take: limitNumber,
        include: {
          user: { select: { name: true, email: true } }
        }
      }),
      prisma.auditLog.count({ where: whereClause })
    ]);

    res.json({
      items: logs,
      total,
      page: pageNumber,
      pages: Math.ceil(total / limitNumber)
    });
  } catch (error: any) {
    console.error("Audit fetch error:", error.message);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Helper for other parts of the application to log actions
export const logAudit = async (
  userId: string,
  organizationId: string,
  action: string,
  resource: string,
  ipAddress?: string,
  beforeState?: any,
  afterState?: any
) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        organizationId,
        action,
        resource,
        ipAddress,
        beforeState: beforeState || null,
        afterState: afterState || null
      }
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
};

export default router;
