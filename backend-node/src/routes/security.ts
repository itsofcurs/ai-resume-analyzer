import { Router } from 'express';
import { prisma } from '../server';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

// Phase 5: Security Events Endpoint
router.get('/events', authenticateToken, requireAdmin, async (req: any, res) => {
  try {
    const { severity, riskScore, resource, limit = '100', offset = '0' } = req.query;

    const where: any = {};
    if (severity && severity !== 'ALL') where.severity = String(severity).toUpperCase();
    if (riskScore && riskScore !== 'ALL') where.riskScore = String(riskScore).toUpperCase();
    if (resource) where.resource = String(resource).toLowerCase();

    // Only allow SUPER_ADMIN to see all orgs, otherwise restrict to user's org
    if (req.user.role !== 'SUPER_ADMIN') {
      where.organizationId = req.user.organizationId;
    }

    const events = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: parseInt(String(limit), 10),
      skip: parseInt(String(offset), 10),
      include: {
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    const total = await prisma.auditLog.count({ where });

    res.json({ data: events, total });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch security events' });
  }
});

router.get('/kpis', authenticateToken, requireAdmin, async (req: any, res) => {
  try {
    const orgFilter = req.user.role !== 'SUPER_ADMIN' ? { organizationId: req.user.organizationId } : {};

    const totalUsers = await prisma.user.count({ where: orgFilter });
    const mfaUsers = await prisma.user.count({ where: { ...orgFilter, mfaEnabled: true } });
    const mfaAdoption = totalUsers > 0 ? Math.round((mfaUsers / totalUsers) * 100) : 0;

    const activeSessions = await prisma.session.count({
      where: {
        expiresAt: { gt: new Date() },
        user: orgFilter
      }
    });

    res.json({
      activeSessions,
      mfaAdoption,
      mfaUsers,
      totalUsers
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});

export default router;
