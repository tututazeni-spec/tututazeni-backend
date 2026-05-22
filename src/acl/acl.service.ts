// src/acl/acl.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePermissionDto,
  BulkAssignPermissionsDto,
  CreateRoleDto,
  CloneRoleDto,
  CreatePolicyDto,
  CheckPermissionDto,
  AssignRoleToUserDto,
  AclAuditFilterDto,
} from './acl.dto';

// ─── In-memory permission cache (production: replace with Redis) ──

const permCache = new Map<number, { permissions: string[]; roleCode: string; cachedAt: number }>();
const CACHE_TTL = 60000; // 1 min

function cacheGet(userId: number) {
  const entry = permCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL) {
    permCache.delete(userId);
    return null;
  }
  return entry;
}

function cachePut(userId: number, permissions: string[], roleCode: string) {
  permCache.set(userId, { permissions, roleCode, cachedAt: Date.now() });
}

function cacheInvalidate(userId: number) {
  permCache.delete(userId);
}

// ─── Built-in permission matrix ──────────────────────────────────

const BUILTIN_PERMISSIONS: { name: string; action: string; subject: string; sensitive: boolean }[] =
  [
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
const ROLE_DEFAULTS: Record<string, string[]> = {
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

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class AclService {
  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // PERMISSIONS — CRUD
  // ══════════════════════════════════════════════════════

  async getAllPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ subject: 'asc' }, { action: 'asc' }] });
  }

  async createPermission(dto: CreatePermissionDto) {
    return this.prisma.permission.create({
      data: {
        name: dto.name,
        action: dto.action,
        subject: dto.subject,
        ...(dto.sensitive !== undefined && ({ sensitive: dto.sensitive } as any)),
      },
    });
  }

  // ── Legacy compat: positional args ─────────────────

  async createPermissionLegacy(name: string, action: string, subject: string, roleId: number) {
    const perm = await (this.prisma as any).permission.create({ data: { name, action, subject } });
    await this.assignPermissionToRole(roleId, perm.id);
    return perm;
  }

  // ══════════════════════════════════════════════════════
  // ROLES — CRUD
  // ══════════════════════════════════════════════════════

  async getRoles() {
    return this.prisma.role.findMany({
      include: {
        permissions: { select: { id: true, name: true, action: true, subject: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getRole(id: number) {
    return this.prisma.role.findUnique({
      where: { id },
      include: { permissions: true, _count: { select: { users: true } } },
    });
  }

  async createRole(dto: CreateRoleDto) {
    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description,
        code: dto.code ?? dto.name.toUpperCase().replace(/\s+/g, '_'),
      },
    });

    // Auto-assign default permissions if code matches
    const defaults = ROLE_DEFAULTS[role.code ?? ''] ?? [];
    if (defaults.length > 0) {
      await this.seedDefaultPermissionsForRole(role.id, role.code ?? '', defaults);
    }

    return role;
  }

  async updateRole(id: number, dto: Partial<CreateRoleDto>) {
    return this.prisma.role.update({ where: { id }, data: dto as any });
  }

  async cloneRole(id: number, dto: CloneRoleDto) {
    const source = await this.getRole(id);
    if (!source) throw new Error('Role não encontrado');

    const clone = await this.prisma.role.create({
      data: {
        name: dto.newName,
        code: dto.newName.toUpperCase().replace(/\s+/g, '_'),
        description: `Clone de: ${source.name}`,
      },
    });

    if (source.permissions.length > 0) {
      await this.prisma.role.update({
        where: { id: clone.id },
        data: { permissions: { connect: source.permissions.map(p => ({ id: p.id })) } },
      });
    }

    return this.getRole(clone.id);
  }

  async getRolePermissions(roleId: number) {
    return this.prisma.role.findUnique({
      where: { id: roleId },
      include: { permissions: true },
    });
  }

  async assignPermissionToRole(roleId: number, permissionId: number) {
    return this.prisma.role.update({
      where: { id: roleId },
      data: { permissions: { connect: { id: permissionId } } },
      include: { permissions: true },
    });
  }

  async revokePermissionFromRole(roleId: number, permissionId: number) {
    return this.prisma.role.update({
      where: { id: roleId },
      data: { permissions: { disconnect: { id: permissionId } } },
      include: { permissions: true },
    });
  }

  async bulkAssignPermissions(dto: BulkAssignPermissionsDto) {
    return this.prisma.role.update({
      where: { id: dto.roleId },
      data: { permissions: { connect: dto.permissionIds.map(id => ({ id })) } },
      include: { permissions: true },
    });
  }

  // ══════════════════════════════════════════════════════
  // USER ↔ ROLE
  // ══════════════════════════════════════════════════════

  async assignRoleToUser(dto: AssignRoleToUserDto) {
    await this.prisma.user.update({
      where: { id: dto.userId },
      data: { roleId: dto.roleId },
    });
    cacheInvalidate(dto.userId);

    await this.prisma.auditLog
      .create({
        data: {
          userId: dto.userId,
          action: 'ROLE_ASSIGNED',
          entity: 'User',
          entityId: dto.userId,
          changes: JSON.stringify({ roleId: dto.roleId }),
        },
      })
      .catch(() => {});

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.userId,
          type: 'ROLE_CHANGED',
          message: 'O teu perfil de acesso foi actualizado',
          metadata: JSON.stringify({ roleId: dto.roleId }),
        },
      })
      .catch(() => {});

    return { message: 'Role atribuído com sucesso', userId: dto.userId, roleId: dto.roleId };
  }

  // ══════════════════════════════════════════════════════
  // PERMISSION CHECK (core logic)
  // ══════════════════════════════════════════════════════

  async getUserPermissions(userId: number) {
    // Check cache first
    const cached = cacheGet(userId);
    if (cached)
      return { userId, roleCode: cached.roleCode, permissions: cached.permissions, cached: true };

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: true } } },
    });

    const roleCode = user?.role?.code ?? user?.role?.name ?? 'COLABORADOR';
    const permissions = (user?.role as any)?.permissions?.map((p: any) => p.name) ?? [];

    // Add wildcard if ADMIN
    const effective =
      roleCode === 'ADMIN' || permissions.includes('*')
        ? ['*', ...BUILTIN_PERMISSIONS.map(p => p.name)]
        : permissions;

    cachePut(userId, effective, roleCode);
    return { userId, roleCode, permissions: effective, cached: false };
  }

  async hasPermission(userId: number, permission: string): Promise<boolean> {
    const { permissions } = await this.getUserPermissions(userId);
    return permissions.includes('*') || permissions.includes(permission);
  }

  async checkPermission(dto: CheckPermissionDto) {
    const { permissions, roleCode } = await this.getUserPermissions(dto.userId);
    const permKey = `${dto.subject.toLowerCase()}:${dto.action.toLowerCase()}`;

    // Wildcard check
    if (permissions.includes('*')) {
      return { allowed: true, reason: 'ADMIN wildcard', roleCode };
    }

    // Direct match
    if (permissions.includes(permKey)) {
      // Check active policies
      const denied = await this.evaluatePolicies(dto.userId, dto.action, dto.subject, dto.context);
      if (denied) {
        await this.logDenied(dto.userId, dto.action, dto.subject, 'Policy denied');
        return { allowed: false, reason: 'Policy override', roleCode };
      }
      return { allowed: true, reason: 'Permission granted', roleCode };
    }

    await this.logDenied(dto.userId, dto.action, dto.subject, 'Permission not found');
    return { allowed: false, reason: 'Permission not granted', roleCode };
  }

  // ══════════════════════════════════════════════════════
  // POLICIES (ABAC / PBAC)
  // ══════════════════════════════════════════════════════

  async getPolicies() {
    return (this.prisma as any).accessPolicy
      ?.findMany({ orderBy: { priority: 'desc' } })
      .catch(() => [] as any[]);
  }

  async createPolicy(dto: CreatePolicyDto, createdById: number) {
    return (this.prisma as any).accessPolicy
      ?.create({
        data: {
          name: dto.name,
          description: dto.description,
          subject: dto.subject,
          action: dto.action,
          condition: dto.condition,
          effect: dto.effect,
          priority: dto.priority ?? 0,
          requiresJustification: dto.requiresJustification ?? false,
          createdById,
          active: true,
        },
      })
      .catch(() => ({
        message: 'Política registada (modelo accessPolicy ausente — execute migration)',
        ...dto,
      }));
  }

  private async evaluatePolicies(
    userId: number,
    action: string,
    subject: string,
    context?: Record<string, any>,
  ): Promise<boolean> {
    // DENY = true means access denied
    const policies = await (this.prisma as any).accessPolicy
      ?.findMany({
        where: {
          active: true,
          effect: 'DENY',
          ...(subject ? { subject } : {}),
          ...(action ? { action } : {}),
        },
        orderBy: { priority: 'desc' },
      })
      .catch(() => [] as any[]);

    for (const policy of policies as any[]) {
      try {
        const condition = JSON.parse(policy.condition);
        // Simple condition evaluator
        if (condition.departmentId && context?.departmentId) {
          if (context.departmentId !== condition.departmentId) continue;
        }
        if (condition.roleCode) {
          const { roleCode } = await this.getUserPermissions(userId);
          if (roleCode === condition.roleCode) return true; // deny
        }
      } catch {}
    }
    return false;
  }

  // ══════════════════════════════════════════════════════
  // AUDIT
  // ══════════════════════════════════════════════════════

  async getAuditLog(filters: AclAuditFilterDto) {
    const { page = 1, limit = 30, userId, action, from, to } = filters;
    const skip = (page - 1) * limit;
    const where: any = { entity: { in: ['User', 'Role', 'Permission', 'ACL'] } };
    if (userId) where.userId = userId;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getDeniedLog(filters: AclAuditFilterDto) {
    const { page = 1, limit = 30 } = filters;
    const skip = (page - 1) * limit;
    const where: any = { action: 'ACCESS_DENIED' };
    if (filters.userId) where.userId = filters.userId;

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  private async logDenied(userId: number, action: string, subject: string, reason: string) {
    await this.prisma.auditLog
      .create({
        data: {
          userId,
          action: 'ACCESS_DENIED',
          entity: 'ACL',
          entityId: null,
          changes: JSON.stringify({ action, subject, reason }),
        },
      })
      .catch(() => {});
  }

  // ══════════════════════════════════════════════════════
  // PERMISSION MATRIX (for admin UI)
  // ══════════════════════════════════════════════════════

  async getPermissionMatrix() {
    const [roles, permissions] = await Promise.all([
      this.prisma.role.findMany({ include: { permissions: { select: { id: true, name: true } } } }),
      this.prisma.permission.findMany({ orderBy: [{ subject: 'asc' }, { action: 'asc' }] }),
    ]);

    // Build matrix: permission × role → granted
    const matrix = permissions.map(p => {
      const row: Record<string, boolean> = {};
      for (const r of roles) {
        row[r.name] = r.permissions.some(rp => rp.id === p.id);
      }
      return { permission: p, ...row };
    });

    return {
      roles: roles.map(r => ({ id: r.id, name: r.name, code: r.code })),
      permissions,
      matrix,
    };
  }

  // ══════════════════════════════════════════════════════
  // SEED DEFAULTS
  // ══════════════════════════════════════════════════════

  async seedBuiltinPermissions() {
    const created: any[] = [];
    for (const p of BUILTIN_PERMISSIONS) {
      const existing = await this.prisma.permission.findFirst({ where: { name: p.name } });
      if (!existing) {
        const perm = await (this.prisma as any).permission.create({
          data: { name: p.name, action: p.action, subject: p.subject },
        });
        created.push(perm);
      }
    }
    return { message: `${created.length} permissões criadas`, created };
  }

  async seedDefaultPermissionsForRole(roleId: number, roleCode: string, permNames: string[]) {
    const isWildcard = permNames.includes('*');

    if (isWildcard) {
      const allPerms = await this.prisma.permission.findMany({ select: { id: true } });
      await this.prisma.role.update({
        where: { id: roleId },
        data: { permissions: { connect: allPerms.map(p => ({ id: p.id })) } },
      });
      return;
    }

    const perms = await this.prisma.permission.findMany({ where: { name: { in: permNames } } });
    if (perms.length) {
      await this.prisma.role.update({
        where: { id: roleId },
        data: { permissions: { connect: perms.map(p => ({ id: p.id })) } },
      });
    }
  }

  // ══════════════════════════════════════════════════════
  // STATS
  // ══════════════════════════════════════════════════════

  async getStats() {
    const [totalUsers, totalRoles, totalPermissions, deniedCount, recentDenied] = await Promise.all(
      [
        this.prisma.user.count({ where: { active: true } }),
        this.prisma.role.count(),
        this.prisma.permission.count(),
        this.prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } }).catch(() => 0),
        this.prisma.auditLog
          .findMany({
            where: { action: 'ACCESS_DENIED' },
            include: { user: { select: { id: true, fullName: true } } },
            orderBy: { timestamp: 'desc' },
            take: 5,
          })
          .catch(() => [] as any[]),
      ],
    );

    // Role distribution
    const roleBreakdown = await this.prisma.user
      .groupBy({
        by: ['roleId'],
        where: { active: true },
        _count: { id: true },
      })
      .then(async rows => {
        const ids = rows.map(r => r.roleId).filter(Boolean);
        const roles = await this.prisma.role.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, code: true },
        });
        const rMap = new Map(roles.map(r => [r.id, r]));
        return rows
          .map(r => ({ role: rMap.get(r.roleId), count: r._count.id }))
          .sort((a, b) => b.count - a.count);
      });

    return { totalUsers, totalRoles, totalPermissions, deniedCount, roleBreakdown, recentDenied };
  }
}
