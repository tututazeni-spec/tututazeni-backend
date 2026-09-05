// src/roles-permissions/role-defaults.ts
// Catálogo de permissões built-in + permissões por omissão de cada role.
// Movido de src/acl/acl.service.ts na Fase D (consolidação roles/permissions).
// Importado por roles-permissions.service.ts (canónico) e, até ser eliminado,
// por acl.service.ts.
import { PermissionAction, PermissionSubject } from '@prisma/client';

// ─── Built-in permission matrix ──────────────────────────────────

export const BUILTIN_PERMISSIONS: {
  name: string;
  action: PermissionAction;
  subject: PermissionSubject;
  sensitive: boolean;
}[] = [
  // Dashboard
  { name: 'dashboard:view', action: 'VIEW', subject: 'DASHBOARD', sensitive: false },
  { name: 'dashboard:export', action: 'EXPORT', subject: 'DASHBOARD', sensitive: false },
  // Reports
  { name: 'reports:view', action: 'VIEW', subject: 'REPORTS', sensitive: false },
  { name: 'reports:create', action: 'CREATE', subject: 'REPORTS', sensitive: false },
  { name: 'reports:export', action: 'EXPORT', subject: 'REPORTS', sensitive: false },
  // Users / HR
  { name: 'users:view', action: 'VIEW', subject: 'USERS', sensitive: false },
  { name: 'users:create', action: 'CREATE', subject: 'USERS', sensitive: false },
  { name: 'users:update', action: 'UPDATE', subject: 'USERS', sensitive: false },
  { name: 'users:delete', action: 'DELETE', subject: 'USERS', sensitive: false },
  // LMS
  { name: 'lms:view', action: 'VIEW', subject: 'LMS', sensitive: false },
  { name: 'lms:create', action: 'CREATE', subject: 'LMS', sensitive: false },
  { name: 'lms:update', action: 'UPDATE', subject: 'LMS', sensitive: false },
  { name: 'lms:export', action: 'EXPORT', subject: 'LMS', sensitive: false },
  // Performance
  { name: 'performance:view', action: 'VIEW', subject: 'PERFORMANCE', sensitive: false },
  { name: 'performance:view_all', action: 'VIEW', subject: 'PERFORMANCE', sensitive: true },
  { name: 'performance:create', action: 'CREATE', subject: 'PERFORMANCE', sensitive: false },
  { name: 'performance:approve', action: 'APPROVE', subject: 'PERFORMANCE', sensitive: false },
  // Engagement
  { name: 'engagement:view', action: 'VIEW', subject: 'ENGAGEMENT', sensitive: false },
  { name: 'engagement:create', action: 'CREATE', subject: 'ENGAGEMENT', sensitive: false },
  // Talent
  { name: 'talent:view', action: 'VIEW', subject: 'TALENT', sensitive: false },
  { name: 'talent:create', action: 'CREATE', subject: 'TALENT', sensitive: false },
  { name: 'talent:approve', action: 'APPROVE', subject: 'TALENT', sensitive: false },
  // Evaluation
  { name: 'evaluation:view', action: 'VIEW', subject: 'EVALUATION', sensitive: false },
  { name: 'evaluation:create', action: 'CREATE', subject: 'EVALUATION', sensitive: false },
  // Content
  { name: 'content:view', action: 'VIEW', subject: 'CONTENT_LIBRARY', sensitive: false },
  { name: 'content:create', action: 'CREATE', subject: 'CONTENT_LIBRARY', sensitive: false },
  // Avatar
  { name: 'avatar:view', action: 'VIEW', subject: 'AVATAR_TRAINING', sensitive: false },
  { name: 'avatar:create', action: 'CREATE', subject: 'AVATAR_TRAINING', sensitive: false },
  // Payroll (sensitive)
  { name: 'payroll:view', action: 'VIEW', subject: 'PAYROLL', sensitive: true },
  { name: 'payroll:export', action: 'EXPORT', subject: 'PAYROLL', sensitive: true },
  // Sensitive data
  { name: 'sensitive:view', action: 'VIEW', subject: 'SENSITIVE_DATA', sensitive: true },
  { name: 'sensitive:export', action: 'EXPORT', subject: 'SENSITIVE_DATA', sensitive: true },
  // ACL admin
  { name: 'acl:manage', action: 'ALL', subject: 'ACL', sensitive: false },
  // ROI
  { name: 'roi:view', action: 'VIEW', subject: 'ROI_IMPACT', sensitive: false },
  // History
  { name: 'history:view', action: 'VIEW', subject: 'HISTORY', sensitive: false },
  { name: 'history:export', action: 'EXPORT', subject: 'HISTORY', sensitive: false },
];

/** Default permissions per role code */
export const ROLE_DEFAULTS: Record<string, string[]> = {
  ADMIN: ['*'],
  RH: [
    'dashboard:view',
    'dashboard:export',
    'reports:view',
    'reports:create',
    'reports:export',
    'users:view',
    'users:create',
    'users:update',
    'lms:view',
    'lms:create',
    'lms:update',
    'performance:view',
    'performance:view_all',
    'performance:create',
    'performance:approve',
    'engagement:view',
    'engagement:create',
    'talent:view',
    'talent:create',
    'talent:approve',
    'evaluation:view',
    'evaluation:create',
    'content:view',
    'content:create',
    'payroll:view',
    'payroll:export',
    'sensitive:view',
    'roi:view',
    'history:view',
    'history:export',
  ],
  LIDER: [
    'dashboard:view',
    'users:view',
    'lms:view',
    'performance:view',
    'performance:create',
    'performance:approve',
    'engagement:view',
    'talent:view',
    'talent:create',
    'evaluation:view',
    'evaluation:create',
    'content:view',
    'history:view',
    'avatar:view',
  ],
  COLABORADOR: [
    'dashboard:view',
    'lms:view',
    'content:view',
    'avatar:view',
    'engagement:view',
    'performance:view',
    'history:view',
  ],
  INSTRUCTOR: [
    'lms:view',
    'lms:create',
    'lms:update',
    'content:view',
    'content:create',
    'avatar:view',
    'avatar:create',
  ],
  AUDITOR: [
    'dashboard:view',
    'reports:view',
    'reports:export',
    'users:view',
    'lms:view',
    'performance:view',
    'history:view',
    'history:export',
    'sensitive:view',
  ],
  DIRECTOR: [
    'dashboard:view',
    'dashboard:export',
    'reports:view',
    'reports:export',
    'users:view',
    'performance:view',
    'performance:view_all',
    'talent:view',
    'roi:view',
    'history:view',
  ],
};
