// Enterprise RBAC & Permissions Matrix

export enum Resource {
  CANDIDATE = 'CANDIDATE',
  JOB = 'JOB',
  ANALYTICS = 'ANALYTICS',
  BILLING = 'BILLING',
  AUDIT = 'AUDIT',
  SETTINGS = 'SETTINGS',
}

export enum Action {
  CREATE = 'CREATE',
  READ = 'READ',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  MANAGE = 'MANAGE', // Includes all actions
}

export type Permission = {
  resource: Resource;
  actions: Action[];
};

export const RolePermissions: Record<string, Permission[]> = {
  'SUPER_ADMIN': [
    { resource: Resource.CANDIDATE, actions: [Action.MANAGE] },
    { resource: Resource.JOB, actions: [Action.MANAGE] },
    { resource: Resource.ANALYTICS, actions: [Action.MANAGE] },
    { resource: Resource.BILLING, actions: [Action.MANAGE] },
    { resource: Resource.AUDIT, actions: [Action.MANAGE] },
    { resource: Resource.SETTINGS, actions: [Action.MANAGE] },
  ],
  'ORGANIZATION_ADMIN': [
    { resource: Resource.CANDIDATE, actions: [Action.MANAGE] },
    { resource: Resource.JOB, actions: [Action.MANAGE] },
    { resource: Resource.ANALYTICS, actions: [Action.MANAGE] },
    { resource: Resource.BILLING, actions: [Action.READ, Action.UPDATE] },
    { resource: Resource.AUDIT, actions: [Action.READ] },
    { resource: Resource.SETTINGS, actions: [Action.MANAGE] },
  ],
  'EXECUTIVE': [
    { resource: Resource.CANDIDATE, actions: [Action.READ] },
    { resource: Resource.JOB, actions: [Action.READ] },
    { resource: Resource.ANALYTICS, actions: [Action.READ] },
    { resource: Resource.BILLING, actions: [Action.READ] },
    { resource: Resource.AUDIT, actions: [Action.READ] },
    { resource: Resource.SETTINGS, actions: [Action.READ] },
  ],
  'HIRING_MANAGER': [
    { resource: Resource.CANDIDATE, actions: [Action.READ, Action.UPDATE] },
    { resource: Resource.JOB, actions: [Action.READ, Action.UPDATE] },
    { resource: Resource.ANALYTICS, actions: [Action.READ] },
  ],
  'RECRUITER': [
    { resource: Resource.CANDIDATE, actions: [Action.CREATE, Action.READ, Action.UPDATE] },
    { resource: Resource.JOB, actions: [Action.CREATE, Action.READ, Action.UPDATE] },
    { resource: Resource.ANALYTICS, actions: [Action.READ] },
  ],
  'INTERVIEWER': [
    { resource: Resource.CANDIDATE, actions: [Action.READ, Action.UPDATE] },
  ],
  'FINANCE': [
    { resource: Resource.BILLING, actions: [Action.MANAGE] },
    { resource: Resource.ANALYTICS, actions: [Action.READ] },
  ],
  'READ_ONLY_AUDITOR': [
    { resource: Resource.CANDIDATE, actions: [Action.READ] },
    { resource: Resource.JOB, actions: [Action.READ] },
    { resource: Resource.ANALYTICS, actions: [Action.READ] },
    { resource: Resource.BILLING, actions: [Action.READ] },
    { resource: Resource.AUDIT, actions: [Action.READ] },
    { resource: Resource.SETTINGS, actions: [Action.READ] },
  ],
};

export const hasPermission = (userRole: string, resource: Resource, action: Action): boolean => {
  const normalizedRole = userRole.toUpperCase();
  const permissions = RolePermissions[normalizedRole] || [];
  
  const resourcePerms = permissions.find(p => p.resource === resource);
  if (!resourcePerms) return false;
  
  if (resourcePerms.actions.includes(Action.MANAGE)) return true;
  return resourcePerms.actions.includes(action);
};
