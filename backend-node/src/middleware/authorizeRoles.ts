import { Request, Response, NextFunction } from "express";

export const authorizeRoles = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // req.user should be set by the authenticateToken middleware first
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized. Please log in." });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden. You do not have permission to access this resource." });
      return;
    }

    // Check tenant isolation: Ensure the route parameter or body matches the user's organizationId
    // Never trust frontend-provided orgId if it conflicts with the JWT
    const targetOrgId = req.params.organizationId || req.body.organizationId || req.query.organizationId;
    if (targetOrgId && targetOrgId !== req.user.organizationId) {
      if (req.user.role !== "SUPER_ADMIN") {
        res.status(403).json({ error: "Forbidden. Cross-tenant access is not allowed." });
        return;
      }
    }

    next();
  };
};
