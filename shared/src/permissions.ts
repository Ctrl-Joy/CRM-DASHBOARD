import type { Role } from './constants';

// Granular permissions. Each organization can override the defaults below from
// Settings → Roles; admins always keep every permission.
export const PERMISSIONS = {
  'records:delete': 'Delete records',
  'records:export': 'Export records to CSV',
  'records:import': 'Import records from CSV',
  'records:reassign': 'Reassign record owners',
  'records:view_team': "View teammates' records",
  'records:view_all': 'View every record in the organization',
  'reports:team': 'View team dashboards and reports',
  'reports:build': 'Create and save custom reports',
  'workflows:manage': 'Create and edit automations',
  'products:manage': 'Manage the product catalog',
  'pipelines:manage': 'Edit pipelines and stages',
  'templates:manage': 'Manage shared email templates',
  'campaigns:manage': 'Create and edit campaigns',
  'users:manage': 'Invite and manage users and teams',
  'settings:manage': 'Manage organization settings, fields and tags',
  'audit:read': 'View the audit log',
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  rep: ['records:export'],
  manager: [
    'records:delete', 'records:export', 'records:import', 'records:reassign', 'records:view_team',
    'reports:team', 'reports:build', 'workflows:manage', 'products:manage', 'templates:manage', 'campaigns:manage',
  ],
  admin: ALL_PERMISSIONS,
};

export type RolePermissionMap = Record<Role, Permission[]>;

/** Resolve the effective permission map from an org's stored overrides (JSON). */
export function resolveRolePermissions(overrides: Partial<RolePermissionMap> | null | undefined): RolePermissionMap {
  return {
    rep: overrides?.rep ?? DEFAULT_ROLE_PERMISSIONS.rep,
    manager: overrides?.manager ?? DEFAULT_ROLE_PERMISSIONS.manager,
    admin: ALL_PERMISSIONS,
  };
}
