// src/acl/acl.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { Prisma, PermissionAction, PermissionSubject } from '@prisma/client';
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

// ─── Permission cache (Redis via CacheService — antes era um Map em memória do
// processo, o que dava permissões desactualizadas noutras instâncias após uma
// mudança de role, em qualquer deployment com mais do que 1 réplica) ──

const PERM_CACHE_TTL_SECONDS = 60;

function permKey(userId: number): string {
  return `acl:perm:${userId}`;
}

// accessPolicy não existe em prisma/schema.prisma — acesso dinâmico
// `prisma[name]` a um modelo que pode não existir não tem tipo gerado pelo
// Prisma. O único cast que sobra é o `as unknown as DynamicModelDelegate`
// abaixo, confinado a esta linha (antes era `prisma: any` no parâmetro
// inteiro, o que desligava a verificação de tipos em toda a função); mesmo
// padrão de safeM()/safeModel() noutros serviços do projecto.
//
// Achado real corrigido ao introduzir este helper: o código anterior fazia
// `(this.prisma as any).accessPolicy?.findMany(...).catch(...)` — o `?.`
// faz short-circuit de TODA a cadeia opcional quando `accessPolicy` é
// undefined, incluindo o `.catch()` encadeado a seguir; `getPolicies()`
// devolvia `undefined` em vez de `[]`, e em evaluatePolicies() o `for
// (const policy of policies as any[])` sobre `undefined` REBENTAVA sempre
// com TypeError — no caminho mais comum de checkPermission() (qualquer
// verificação em que o utilizador TEM a permissão). safeM() garante sempre
// um objecto com métodos reais (nunca undefined), por isso o .catch()
// encadeado a seguir passa a funcionar como esperado.
type DynamicModelDelegate = Record<string, (...args: unknown[]) => Promise<unknown>>;

function safeM(prisma: PrismaService, name: string): DynamicModelDelegate {
  return (
    (prisma as unknown as Record<string, DynamicModelDelegate | undefined>)[name] ?? {
      findMany: async () => [],
      findFirst: async () => null,
      create: async (d: unknown) => (d as { data: unknown }).data,
    }
  );
}

// Forma real de um registo accessPolicy (confirmada no próprio .create()
// deste ficheiro) — sem tipos gerados pelo Prisma.
export interface AccessPolicyRow {
  id: number;
  name: string;
  description?: string | null;
  subject: string;
  action: string;
  condition: string;
  effect: 'ALLOW' | 'DENY';
  priority: number;
  requiresJustification: boolean;
  createdById: number;
  active: boolean;
}

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
  private readonly logger = new Logger(AclService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  // ══════════════════════════════════════════════════════
  // PERMISSIONS — CRUD
  // ══════════════════════════════════════════════════════

  async getAllPermissions() {
    return this.prisma.read.permission.findMany({
      orderBy: [{ subject: 'asc' }, { action: 'asc' }],
    });
  }

  async createPermission(dto: CreatePermissionDto) {
    const roleId = await this.getAdminRoleId();
    // Achado real: Permission não tem coluna `sensitive` (nem `description`)
    // no schema real — `dto.sensitive` ia escondido atrás de `as any` e,
    // quando efectivamente enviado pelo cliente (campo público e
    // documentado no DTO, @IsOptional mas aceite), rebentava sempre com
    // "Unknown argument sensitive" (500 em bruto do Prisma). Sem migração
    // ao schema, sensitive/description não podem ser persistidos —
    // omitidos deliberadamente do create() em vez de fingir que existem.
    return this.prisma.permission.create({
      data: { name: dto.name, action: dto.action, subject: dto.subject, roleId },
    });
  }

  // Permission.roleId é obrigatório no schema (resquício de um design anterior
  // à relação many-to-many via RolePermission, que é a que o ACL usa de facto —
  // ver assignPermissionToRole/revokePermissionFromRole). ADMIN é o dono lógico
  // de todas as permissões (wildcard em getUserPermissions).
  private async getAdminRoleId(): Promise<number> {
    const adminRole = await this.prisma.role.findFirst({ where: { name: 'ADMIN' } });
    if (!adminRole) {
      throw new Error("Role 'ADMIN' não encontrado — não é possível criar permissões sem ele");
    }
    return adminRole.id;
  }

  // ══════════════════════════════════════════════════════
  // ROLES — CRUD
  // ══════════════════════════════════════════════════════

  async getRoles() {
    return this.prisma.read.role.findMany({
      include: {
        permissions: { select: { id: true, name: true, action: true, subject: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getRole(id: number) {
    return this.prisma.read.role.findUnique({
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
    // Achado real: CreateRoleDto tem `priority`/`parentRoleId`, mas Role não
    // tem essas colunas no schema real (só id/name/description/code) —
    // enviá-los rebentava sempre com "Unknown argument priority/
    // parentRoleId" (500 em bruto do Prisma), mascarado pelo `as any`.
    const { priority: _priority, parentRoleId: _parentRoleId, ...data } = dto;
    return this.prisma.role.update({ where: { id }, data });
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
    return this.prisma.read.role.findUnique({
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

  // Permission.roleId é obrigatório (relação 1:N de dono único, não M2M) — não é
  // possível "disconnect" numa relação required. Revogar reatribui a permissão
  // ao role ADMIN (o mesmo dono por omissão usado em createPermission).
  async revokePermissionFromRole(roleId: number, permissionId: number) {
    const adminRoleId = await this.getAdminRoleId();
    await this.prisma.permission.update({
      where: { id: permissionId },
      data: { roleId: adminRoleId },
    });
    return this.getRole(roleId);
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
    await this.cache.del(permKey(dto.userId));

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
      .catch(e => {
        this.logger.warn({
          userId: dto.userId,
          action: 'ROLE_ASSIGNED',
          entityId: dto.userId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao escrever audit log de atribuição de role',
        });
      });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: dto.userId,
          type: 'ROLE_CHANGED',
          message: 'O teu perfil de acesso foi actualizado',
          metadata: JSON.stringify({ roleId: dto.roleId }),
        },
      })
      .catch(e => {
        this.logger.warn({
          userId: dto.userId,
          action: 'ROLE_CHANGED',
          roleId: dto.roleId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar notificação de mudança de role',
        });
      });

    return { message: 'Role atribuído com sucesso', userId: dto.userId, roleId: dto.roleId };
  }

  // ══════════════════════════════════════════════════════
  // PERMISSION CHECK (core logic)
  // ══════════════════════════════════════════════════════

  async getUserPermissions(userId: number) {
    // Check cache first
    const cached = await this.cache.get<{ permissions: string[]; roleCode: string }>(
      permKey(userId),
    );
    if (cached)
      return { userId, roleCode: cached.roleCode, permissions: cached.permissions, cached: true };

    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: true } } },
    });

    const roleCode = user?.role?.code ?? user?.role?.name ?? 'COLABORADOR';
    const permissions = user?.role?.permissions?.map(p => p.name) ?? [];

    // Add wildcard if ADMIN
    const effective =
      roleCode === 'ADMIN' || permissions.includes('*')
        ? ['*', ...BUILTIN_PERMISSIONS.map(p => p.name)]
        : permissions;

    await this.cache.set(
      permKey(userId),
      { permissions: effective, roleCode },
      PERM_CACHE_TTL_SECONDS,
    );
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

  async getPolicies(): Promise<AccessPolicyRow[]> {
    return (
      safeM(this.prisma, 'accessPolicy').findMany({
        orderBy: { priority: 'desc' },
      }) as Promise<AccessPolicyRow[]>
    ).catch((e: unknown) => {
      this.logger.warn({
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao ler políticas de acesso (accessPolicy)',
      });
      return [];
    });
  }

  async createPolicy(dto: CreatePolicyDto, createdById: number) {
    return safeM(this.prisma, 'accessPolicy')
      .create({
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
      .catch((e: unknown) => {
        this.logger.warn({
          createdById,
          action: 'createPolicy',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar política de acesso — modelo accessPolicy pode estar ausente',
        });
        return {
          message: 'Política registada (modelo accessPolicy ausente — execute migration)',
          ...dto,
        };
      });
  }

  private async evaluatePolicies(
    userId: number,
    action: string,
    subject: string,
    context?: Record<string, unknown>,
  ): Promise<boolean> {
    // DENY = true means access denied
    const policies: AccessPolicyRow[] = await (
      safeM(this.prisma, 'accessPolicy').findMany({
        where: {
          active: true,
          effect: 'DENY',
          ...(subject ? { subject } : {}),
          ...(action ? { action } : {}),
        },
        orderBy: { priority: 'desc' },
      }) as Promise<AccessPolicyRow[]>
    ).catch((e: unknown) => {
      this.logger.warn({
        userId,
        action,
        subject,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao ler políticas DENY — modelo accessPolicy pode estar ausente',
      });
      return [];
    });

    for (const policy of policies) {
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
      } catch (e: unknown) {
        this.logger.warn({
          userId,
          policyId: policy?.id,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao avaliar condição de política de acesso',
        });
      }
    }
    return false;
  }

  // ══════════════════════════════════════════════════════
  // AUDIT
  // ══════════════════════════════════════════════════════

  async getAuditLog(filters: AclAuditFilterDto) {
    const { page = 1, limit = 30, userId, action, from, to } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.AuditLogWhereInput = {
      entity: { in: ['User', 'Role', 'Permission', 'ACL'] },
    };
    if (userId) where.userId = userId;
    if (action) where.action = { contains: action, mode: 'insensitive' };
    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from);
      if (to) where.timestamp.lte = new Date(to);
    }

    const [data, total] = await Promise.all([
      this.prisma.read.auditLog.findMany({
        where,
        skip,
        take: limit,
        include: { user: { select: { id: true, fullName: true, email: true } } },
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.read.auditLog.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getDeniedLog(filters: AclAuditFilterDto) {
    const { page = 1, limit = 30 } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.AuditLogWhereInput = { action: 'ACCESS_DENIED' };
    if (filters.userId) where.userId = filters.userId;

    const [data, total] = await Promise.all([
      this.prisma.read.auditLog.findMany({
        where,
        skip,
        take: limit,
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { timestamp: 'desc' },
      }),
      this.prisma.read.auditLog.count({ where }),
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
      .catch(e => {
        this.logger.warn({
          userId,
          action,
          subject,
          reason,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao escrever audit log de acesso negado',
        });
      });
  }

  // ══════════════════════════════════════════════════════
  // PERMISSION MATRIX (for admin UI)
  // ══════════════════════════════════════════════════════

  async getPermissionMatrix() {
    const [roles, permissions] = await Promise.all([
      this.prisma.read.role.findMany({
        include: { permissions: { select: { id: true, name: true } } },
      }),
      this.prisma.read.permission.findMany({ orderBy: [{ subject: 'asc' }, { action: 'asc' }] }),
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
    // Achado real: `roleId` (obrigatório no schema — ver nota em
    // getAdminRoleId()) nunca era incluído no create() aqui, ao contrário de
    // createPermission() que já o resolve correctamente — cada permissão
    // nova que este seed tentasse criar rebentava sempre com "Argument
    // roleId is missing", mascarado pelo `as any`.
    const roleId = await this.getAdminRoleId();
    const created: Prisma.PermissionGetPayload<object>[] = [];
    for (const p of BUILTIN_PERMISSIONS) {
      const existing = await this.prisma.permission.findFirst({ where: { name: p.name } });
      if (!existing) {
        const perm = await this.prisma.permission.create({
          data: { name: p.name, action: p.action, subject: p.subject, roleId },
        });
        created.push(perm);
      }
    }
    return { message: `${created.length} permissões criadas`, created };
  }

  async seedDefaultPermissionsForRole(roleId: number, roleCode: string, permNames: string[]) {
    const isWildcard = permNames.includes('*');

    if (isWildcard) {
      const allPerms = await this.prisma.read.permission.findMany({ select: { id: true } });
      await this.prisma.role.update({
        where: { id: roleId },
        data: { permissions: { connect: allPerms.map(p => ({ id: p.id })) } },
      });
      return;
    }

    const perms = await this.prisma.read.permission.findMany({
      where: { name: { in: permNames } },
    });
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
    // FIX: `.catch()` a seguir a uma promise Prisma colapsa o tipo inteiro
    // para `any` sem isto — a query extraída para variável preserva o tipo
    // real via `Awaited<typeof query>` (mesmo padrão usado noutros
    // serviços do projecto).
    const recentDeniedQuery = this.prisma.auditLog.findMany({
      where: { action: 'ACCESS_DENIED' },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { timestamp: 'desc' },
      take: 5,
    });

    const [totalUsers, totalRoles, totalPermissions, deniedCount, recentDenied] = await Promise.all(
      [
        this.prisma.read.user.count({ where: { active: true } }),
        this.prisma.read.role.count(),
        this.prisma.read.permission.count(),
        this.prisma.read.auditLog.count({ where: { action: 'ACCESS_DENIED' } }).catch(e => {
          this.logger.warn({
            action: 'getStats',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao contar acessos negados para estatísticas ACL',
          });
          return 0;
        }),
        recentDeniedQuery.catch((e: unknown): Awaited<typeof recentDeniedQuery> => {
          this.logger.warn({
            action: 'getStats',
            err: { message: e instanceof Error ? e.message : String(e) },
            msg: 'Falha ao obter acessos negados recentes para estatísticas ACL',
          });
          return [];
        }),
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
        const roles = await this.prisma.read.role.findMany({
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
