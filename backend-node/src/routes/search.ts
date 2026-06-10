import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getSearchProvider } from '../search/SearchProvider';

const router = Router();
const searchProvider = getSearchProvider();

router.use(authenticateToken as any);

router.get('/candidates', async (req: AuthRequest, res: any) => {
  try {
    const orgId = req.user!.organizationId;
    const query = req.query.q as string || '';
    const limit = parseInt(req.query.limit as string) || 20;

    const results = await searchProvider.searchCandidates(orgId, query, limit);
    res.json({ results });
  } catch (error: any) {
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/audit', async (req: AuthRequest, res: any) => {
  try {
    const orgId = req.user!.organizationId;
    const query = req.query.q as string || '';
    const limit = parseInt(req.query.limit as string) || 50;

    const results = await searchProvider.searchAuditLogs(orgId, query, limit);
    res.json({ results });
  } catch (error: any) {
    res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
