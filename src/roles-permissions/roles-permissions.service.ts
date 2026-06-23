// src/roles-permissions/roles-permissions.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  RolesPermissionsCreateRoleDto,
  RolesPermissionsUpdateRoleDto,
  BulkAssignRoleDto,
  SimulatePermissionDto,
  RoleTemplateDto,
} from './roles-permissions.dto';

// Re-export DTOs so controller can import from service (legacy compat)
export {
  RolesPermissionsCreateRoleDto,
  RolesPermissionsUpdateRoleDto,
  RolesPermissionsCloneRoleDto,
  BulkAssignRoleDto,
  SetPermissionsDto,
  SimulatePermissionDto,
  RoleTemplateDto,
} from './roles-permissions.dto';

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class RolesPermissionsService {
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // ROLES — CRUD
  // ══════════════════════════════════════════════════════

  async findAll() {
    const roles = await this.prismaRead.role.findMany({
      include: {
        permissions: { select: { id: true, name: true, action: true, subject: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });

    return roles.map(r => ({
      ...r,
      effectivePermissions: r.permissions.length,
      usersCount: r._count.users,
      isSystem: (r as any).isSystem ?? false,
      priority: (r as any).priority ?? 0,
    }));
  }

  async findOne(id: number) {
    const r = await this.prismaRead.role.findUnique({
      where: { id },
      include: {
        permissions: true,
        users: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            email: true,
            department: { select: { name: true } },
            position: { select: { name: true } },
          },
          take: 20,
        },
        _count: { select: { users: true } },
      },
    });
    if (!r) throw new NotFoundException('Role não encontrado');
    return r;
  }

  async create(dto: RolesPermissionsCreateRoleDto) {
    const exists = await this.prisma.role.findFirst({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Nome de role já existe');

    const { permissionIds, ...data } = dto;
    const role = await this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        code: data.code ?? data.name.toUpperCase().replace(/\s+/g, '_'),
        permissions: permissionIds?.length
          ? { connect: permissionIds.map(id => ({ id })) }
          : undefined,
      },
      include: { permissions: true },
    });

    await this.prisma.auditLog
      .create({
        data: {
          userId: 0,
          action: 'ROLE_CREATED',
          entity: 'Role',
          entityId: role.id,
          changes: JSON.stringify({ name: role.name }),
        },
      })
      .catch(() => {});

    return role;
  }

  async update(id: number, dto: RolesPermissionsUpdateRoleDto) {
    const existing = await this.findOne(id);
    if ((existing as any).isSystem && dto.name !== existing.name) {
      throw new BadRequestException('Não é possível renomear um role de sistema');
    }

    const { permissionIds, ...data } = dto;
    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description && { description: data.description }),
        ...(permissionIds !== undefined && {
          permissions: {
            set: permissionIds.map(pid => ({ id: pid })),
          },
        }),
      },
      include: { permissions: true },
    });

    await this.prisma.auditLog
      .create({
        data: {
          userId: 0,
          action: 'ROLE_UPDATED',
          entity: 'Role',
          entityId: id,
          changes: JSON.stringify(dto),
        },
      })
      .catch(() => {});

    return updated;
  }

  async remove(id: number) {
    const role = await this.findOne(id);
    if ((role as any).isSystem)
      throw new BadRequestException('Não é possível remover roles de sistema');
    if ((role._count as any).users > 0)
      throw new ConflictException(
        `Role tem ${(role._count as any).users} utilizador(es) atribuídos — reatribua antes de remover`,
      );

    await this.prisma.role.delete({ where: { id } });
    await this.prisma.auditLog
      .create({
        data: {
          userId: 0,
          action: 'ROLE_DELETED',
          entity: 'Role',
          entityId: id,
          changes: JSON.stringify({ name: role.name }),
        },
      })
      .catch(() => {});

    return { message: 'Role removido com sucesso', roleName: role.name };
  }

  async cloneRole(id: number, newName: string) {
    const source = await this.findOne(id);
    const exists = await this.prisma.role.findFirst({ where: { name: newName } });
    if (exists) throw new ConflictException('Nome de role já existe');

    const clone = await this.prisma.role.create({
      data: {
        name: newName,
        code: newName.toUpperCase().replace(/\s+/g, '_'),
        description: `Clone de: ${source.name}`,
        permissions: { connect: (source as any).permissions.map((p: any) => ({ id: p.id })) },
      },
      include: { permissions: true },
    });
    return clone;
  }

  // ══════════════════════════════════════════════════════
  // USER ↔ ROLE ASSIGNMENT
  // ══════════════════════════════════════════════════════

  async assignToUser(userId: number, roleId: number) {
    await this.findOne(roleId);
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { roleId },
      include: { role: { include: { permissions: true } } },
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'ROLE_CHANGED',
          message: `O teu perfil de acesso foi actualizado para: ${user.role?.name}`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(() => {});

    await this.prisma.auditLog
      .create({
        data: {
          userId,
          action: 'ROLE_ASSIGNED',
          entity: 'User',
          entityId: userId,
          changes: JSON.stringify({ roleId }),
        },
      })
      .catch(() => {});

    return { message: `Role "${user.role?.name}" atribuído a ${user.fullName}`, user };
  }

  async bulkAssignRole(dto: BulkAssignRoleDto) {
    await this.findOne(dto.roleId);
    const results = await Promise.allSettled(
      dto.userIds.map(uid => this.assignToUser(uid, dto.roleId)),
    );
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    return { total: dto.userIds.length, succeeded, failed };
  }

  // ══════════════════════════════════════════════════════
  // PERMISSION MANAGEMENT
  // ══════════════════════════════════════════════════════

  async addPermissionsToRole(roleId: number, permissionIds: number[]) {
    await this.findOne(roleId);
    return this.prisma.role.update({
      where: { id: roleId },
      data: { permissions: { connect: permissionIds.map(id => ({ id })) } },
      include: { permissions: true },
    });
  }

  async removePermissionsFromRole(roleId: number, permissionIds: number[]) {
    await this.findOne(roleId);
    return this.prisma.role.update({
      where: { id: roleId },
      data: { permissions: { disconnect: permissionIds.map(id => ({ id })) } },
      include: { permissions: true },
    });
  }

  async setRolePermissions(roleId: number, permissionIds: number[]) {
    await this.findOne(roleId);
    return this.prisma.role.update({
      where: { id: roleId },
      data: { permissions: { set: permissionIds.map(id => ({ id })) } },
      include: { permissions: true },
    });
  }

  // ══════════════════════════════════════════════════════
  // PERMISSION MATRIX
  // ══════════════════════════════════════════════════════

  async getPermissionMatrix() {
    const [roles, permissions] = await Promise.all([
      this.prismaRead.role.findMany({
        include: { permissions: { select: { id: true, name: true } } },
      }),
      this.prismaRead.permission.findMany({ orderBy: [{ subject: 'asc' }, { action: 'asc' }] }),
    ]);

    // Group permissions by subject
    const grouped: Record<string, any[]> = {};
    for (const p of permissions) {
      if (!grouped[p.subject]) grouped[p.subject] = [];
      grouped[p.subject].push(p);
    }

    const matrix = permissions.map(p => {
      const row: Record<string, boolean> = {};
      for (const r of roles) row[r.name] = r.permissions.some(rp => rp.id === p.id);
      return { permission: p, ...row };
    });

    return {
      roles: roles.map(r => ({ id: r.id, name: r.name, code: (r as any).code })),
      permissions,
      grouped: Object.entries(grouped).map(([subject, perms]) => ({ subject, permissions: perms })),
      matrix,
    };
  }

  // ══════════════════════════════════════════════════════
  // ROLE COMPARISON
  // ══════════════════════════════════════════════════════

  async compareRoles(roleIdA: number, roleIdB: number) {
    const [a, b] = await Promise.all([this.findOne(roleIdA), this.findOne(roleIdB)]);
    const permsA = new Set((a as any).permissions.map((p: any) => p.name));
    const permsB = new Set((b as any).permissions.map((p: any) => p.name));

    const onlyInA = [...permsA].filter(p => !permsB.has(p));
    const onlyInB = [...permsB].filter(p => !permsA.has(p));
    const inBoth = [...permsA].filter(p => permsB.has(p));

    return {
      roleA: { id: a.id, name: a.name },
      roleB: { id: b.id, name: b.name },
      onlyInA,
      onlyInB,
      inBoth,
      totalA: permsA.size,
      totalB: permsB.size,
      overlap: inBoth.length,
    };
  }

  // ══════════════════════════════════════════════════════
  // PERMISSION SIMULATOR
  // ══════════════════════════════════════════════════════

  async simulatePermission(dto: SimulatePermissionDto) {
    const user = await this.prismaRead.user.findUnique({
      where: { id: dto.userId },
      include: { role: { include: { permissions: true } } },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    const rolePerms = (user.role as any)?.permissions ?? [];
    const permName = `${dto.resource.toLowerCase()}:${dto.action.toLowerCase()}`;
    const hasWildcard = rolePerms.some((p: any) => p.name === '*' || p.action === '*');
    const hasPerm =
      hasWildcard ||
      rolePerms.some(
        (p: any) =>
          p.name === permName ||
          (p.subject === dto.resource.toUpperCase() && p.action === dto.action.toUpperCase()),
      );

    const matchedPerm = rolePerms.find(
      (p: any) =>
        p.name === permName ||
        (p.subject === dto.resource.toUpperCase() && p.action === dto.action.toUpperCase()),
    );

    return {
      userId: dto.userId,
      user: { id: user.id, fullName: user.fullName, email: user.email },
      role: { id: user.role?.id, name: user.role?.name, code: (user.role as any)?.code },
      resource: dto.resource,
      action: dto.action,
      allowed: hasPerm,
      reason: hasWildcard
        ? 'ADMIN wildcard (*)'
        : hasPerm
          ? `Permissão "${matchedPerm?.name}" concedida via role "${user.role?.name}"`
          : `Permissão "${permName}" não encontrada no role "${user.role?.name}"`,
      chain: [
        {
          step: 1,
          check: 'Role lookup',
          result: !!user.role,
          detail: user.role?.name ?? 'Sem role',
        },
        {
          step: 2,
          check: 'Wildcard check',
          result: hasWildcard,
          detail: hasWildcard ? 'Admin wildcard activo' : 'Sem wildcard',
        },
        {
          step: 3,
          check: 'Permission check',
          result: hasPerm,
          detail: matchedPerm?.name ?? 'Não encontrado',
        },
      ],
    };
  }

  // ══════════════════════════════════════════════════════
  // POSITION TEMPLATES
  // ══════════════════════════════════════════════════════

  async getPositionTemplates() {
    return (this.prisma as any).roleTemplate
      ?.findMany({
        include: { role: { select: { id: true, name: true, code: true } } },
        orderBy: { positionName: 'asc' },
      })
      .catch(() => [] as any[]);
  }

  async createPositionTemplate(dto: RoleTemplateDto) {
    return (this.prisma as any).roleTemplate
      ?.create({
        data: {
          positionName: dto.positionName,
          roleId: dto.roleId,
          positionId: dto.positionId,
        },
      })
      .catch(() => ({
        message: 'Template registado (modelo roleTemplate ausente — execute migration)',
        ...dto,
      }));
  }

  async applyPositionTemplate(positionId: number) {
    // Find template for this position
    const template = await (this.prisma as any).roleTemplate
      ?.findFirst({
        where: { positionId },
      })
      .catch(() => null);

    if (!template) return { applied: 0, message: 'Sem template para esta posição' };

    // Apply role to all users in this position
    const users = await this.prismaRead.user.findMany({
      where: { positionId, active: true },
      select: { id: true },
    });

    if (!users.length) return { applied: 0, message: 'Sem utilizadores nesta posição' };

    const result = await this.bulkAssignRole({
      roleId: template.roleId,
      userIds: users.map(u => u.id),
    });
    return { ...result, positionId, roleId: template.roleId };
  }

  // ══════════════════════════════════════════════════════
  // GOVERNANCE STATS
  // ══════════════════════════════════════════════════════

  async getGovernanceStats() {
    const [roles, permissions, usersWithoutRole, deniedLogs, usersPerRole] = await Promise.all([
      this.prismaRead.role.count(),
      this.prismaRead.permission.count(),
      this.prismaRead.user.count({ where: { active: true, roleId: null } }),
      this.prismaRead.auditLog.count({ where: { action: 'ACCESS_DENIED' } }).catch(() => 0),
      this.prisma.user
        .groupBy({
          by: ['roleId'],
          where: { active: true },
          _count: { id: true },
        })
        .then(async rows => {
          const ids = rows.map(r => r.roleId).filter(Boolean);
          const rols = await this.prismaRead.role.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true, code: true },
          });
          const rMap = new Map(rols.map(r => [r.id, r]));
          return rows
            .map(r => ({ role: rMap.get(r.roleId), count: r._count.id }))
            .sort((a, b) => b.count - a.count);
        }),
    ]);

    // Roles with no users (unused)
    const unusedRoles = await this.prismaRead.role.findMany({
      where: { users: { none: {} } },
      select: { id: true, name: true, code: true },
    });

    return {
      totalRoles: roles,
      totalPermissions: permissions,
      usersWithoutRole,
      deniedAccesses: deniedLogs,
      usersPerRole,
      unusedRoles,
      alerts: [
        ...(usersWithoutRole > 0
          ? [{ type: 'WARNING', message: `${usersWithoutRole} utilizadores sem role atribuído` }]
          : []),
        ...(unusedRoles.length > 0
          ? [{ type: 'INFO', message: `${unusedRoles.length} role(s) sem utilizadores` }]
          : []),
        ...(deniedLogs > 100
          ? [{ type: 'ALERT', message: `Elevado nº de acessos negados: ${deniedLogs}` }]
          : []),
      ],
    };
  }

  // ══════════════════════════════════════════════════════
  // USERS IN ROLE
  // ══════════════════════════════════════════════════════

  async getUsersWithRole(roleId: number) {
    await this.findOne(roleId);
    return this.prismaRead.user.findMany({
      where: { roleId, active: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async getUsersWithoutRole() {
    return this.prismaRead.user.findMany({
      where: { active: true, roleId: null },
      select: {
        id: true,
        fullName: true,
        email: true,
        avatarUrl: true,
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
    });
  }
}
