import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Resource, Action, hasPermission } from '../lib/rbac';
import { verifyAccessToken } from '../utils/tokens';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    id: string;
    role: string;
    organizationId: string;
    iat?: number;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token missing' });

  verifyAccessToken(token)
    .then((user) => {
      req.user = user as any;
      if (req.user) req.user.id = user.userId;
      next();
    })
    .catch((err) => {
      return res.status(403).json({ error: 'Invalid or expired token' });
    });
};

export const requirePermission = (resource: Resource, action: Action) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !hasPermission(req.user.role, resource, action)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient role permissions for this resource' });
    }
    next();
  };
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Legacy shim for simple role checks if needed
export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.map(r => r.toUpperCase()).includes(req.user.role.toUpperCase())) {
      return res.status(403).json({ error: 'Forbidden: Insufficient role permissions' });
    }
    next();
  };
};

export const requireExecutiveRole = requireRole(['EXECUTIVE', 'ORGANIZATION_ADMIN', 'SUPER_ADMIN']);

