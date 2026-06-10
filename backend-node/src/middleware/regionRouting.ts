import { Request, Response, NextFunction } from 'express';
import { logWithTrace } from '../lib/telemetry';

export const regionRoutingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  // Simulate regional routing logic
  const region = process.env.AWS_REGION || process.env.FLY_REGION || 'us-east-1';
  res.setHeader('X-Region', region);

  // Set CDN cache headers for static or highly cacheable routes
  if (req.method === 'GET' && req.path.startsWith('/api/jobs')) {
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300'); // 1m browser cache, 5m CDN cache
  }

  // Simulate failover checking (if primary DB is down, route to replica)
  const isPrimaryDown = process.env.PRIMARY_DB_DOWN === 'true';
  if (isPrimaryDown) {
    res.setHeader('X-Database-Mode', 'read-replica');
    logWithTrace('warn', 'Operating in read-replica mode due to primary DB failover', { region });
    if (req.method !== 'GET') {
      return res.status(503).json({ error: 'Service temporarily in read-only mode during regional failover.' });
    }
  }

  next();
};
