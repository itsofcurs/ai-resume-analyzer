import { Router } from 'express';
import { prisma } from '../server';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Middleware to ensure admin
const requireAdmin = async (req: any, res: any, next: any) => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireFreshAuth = async (req: any, res: any, next: any) => {
  const tokenIat = req.user?.iat;
  if (!tokenIat || (Date.now() / 1000 - tokenIat) > 15 * 60) {
    return res.status(401).json({ error: 'Fresh authentication required. Please login again to perform this administrative action.', requireReAuth: true });
  }
  
  // Enforce MFA for admins
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user?.mfaEnabled) {
    return res.status(403).json({ error: 'MFA must be enabled to perform administrative actions.' });
  }
  
  next();
};

router.use(authenticateToken);
router.use(requireAdmin);

// Get User
router.get('/users/:email', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: req.params.email },
      include: { auditLogs: { take: 10, orderBy: { timestamp: 'desc' } } }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Manually verify
router.post('/users/:id/verify', requireFreshAuth, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { accountState: 'ACTIVE' }
    });
    await prisma.auditLog.create({ data: { userId: req.user.id, organizationId: req.user.organizationId || 'system', action: 'ADMIN_VERIFY_ACCOUNT', resource: 'admin' } });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Unlock account
router.post('/users/:id/unlock', requireFreshAuth, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { lockedUntil: null, failedAttempts: 0 }
    });
    await prisma.auditLog.create({ data: { userId: req.user.id, organizationId: req.user.organizationId || 'system', action: 'ADMIN_UNLOCK_ACCOUNT', resource: 'admin' } });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Suspend account
router.post('/users/:id/suspend', requireFreshAuth, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { accountState: 'SUSPENDED' }
    });
    await prisma.auditLog.create({ data: { userId: req.user.id, organizationId: req.user.organizationId || 'system', action: 'ADMIN_SUSPEND_ACCOUNT', resource: 'admin' } });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reactivate account
router.post('/users/:id/reactivate', requireFreshAuth, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { accountState: 'ACTIVE' }
    });
    await prisma.auditLog.create({ data: { userId: req.user.id, organizationId: req.user.organizationId || 'system', action: 'ADMIN_REACTIVATE_ACCOUNT', resource: 'admin' } });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete account (GDPR Soft Delete)
router.post('/users/:id/delete', requireFreshAuth, async (req, res) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { accountState: 'DELETED', deletedAt: new Date(), email: `deleted_${req.params.id}@deleted.com` }
    });
    await prisma.auditLog.create({ data: { userId: req.user.id, organizationId: req.user.organizationId || 'system', action: 'ADMIN_DELETE_ACCOUNT', resource: 'admin' } });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
