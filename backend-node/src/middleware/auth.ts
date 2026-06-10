import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Resource, Action, hasPermission } from '../lib/rbac';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
    organizationId: string;
  };
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token missing' });

  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
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

