// src/roles-permissions/roles-permissions.service.ts
import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { Permission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { flattenRolePermissions, withFlatPermissions } from '../common/utils/role-permissions';
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
  BulkAssignRoleDto,
  SetPermissionsDto,
  SimulatePermissionDto,
  RoleTemplateDto,
  CloneRoleDto,
  PermissionIdsDto,
} from './roles-permissions.dto';

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class RolesPermissionsService {
  private readonly logger = new Logger(RolesPermissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // ROLES — CRUD
  // ══════════════════════════════════════════════════════

  async findAll() {
    const rawRoles = await this.prisma.read.role.findMany({
      include: {
        rolePermissions: {
          include: {
            permission: { select: { id: true, name: true, action: true, subject: true } },
          },
        },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });

    return rawRoles.map(({ rolePermissions, ...r }) => ({
      ...r,
      permissions: flattenRolePermissions(rolePermissions),
      effectivePermissions: rolePermissions.length,
      usersCount: r._count.users,
      // FIX (achado, não corrigido — precisa de migração/decisão de produto):
      // Role.isSystem/Role.priority NUNCA existiram no schema (confirmado —
      // nenhuma migration os criou). Antes liam-se via `as any` e caíam
      // sempre no fallback; mantido o mesmo comportamento (`false`/`0`)
      // explicitamente, em vez de esconder atrás de um cast. Consequência:
      // as guardas "role de sistema não pode ser renomeado/removido" em
      // update()/remove() nunca dispararam — nenhum role está protegido hoje.
      isSystem: false,
      priority: 0,
    }));
  }

  async findOne(id: number) {
    const r = await this.prisma.read.role.findUnique({
      where: { id },
      include: {
        rolePermissions: { include: { permission: true } },
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
    const { rolePermissions, ...rest } = r;
    return { ...rest, permissions: flattenRolePermissions(rolePermissions) };
  }

  async create(dto: RolesPermissionsCreateRoleDto) {
    const exists = await this.prisma.role.findFirst({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Nome de role já existe');

    const { permissionIds, ...data } = dto;
    const created = await this.prisma.role.create({
      data: {
        name: data.name,
        description: data.description,
        code: data.code ?? data.name.toUpperCase().replace(/\s+/g, '_'),
      },
    });
    if (permissionIds?.length) {
      await this.prisma.rolePermission.createMany({
        data: permissionIds.map(permissionId => ({ roleId: created.id, permissionId })),
        skipDuplicates: true,
      });
    }
    const role = await this.findOne(created.id);

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
      .catch(e =>
        this.logger.warn({
          roleId: role.id,
          action: 'ROLE_CREATED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao registar auditoria de criação de role',
        }),
      );

    return role;
  }

  async update(id: number, dto: RolesPermissionsUpdateRoleDto) {
    // Guarda "role de sistema não pode ser renomeado" removida daqui — lia
    // Role.isSystem, campo que nunca existiu no schema (ver findAll()), pelo
    // que nunca disparou. Ver findAll() para o achado completo.
    await this.findOne(id);

    const { permissionIds, ...data } = dto;
    await this.prisma.role.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description && { description: data.description }),
      },
    });
    if (permissionIds !== undefined) {
      await this.replacePermissionsForRole(id, permissionIds);
    }
    const updated = await this.findOne(id);

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
      .catch(e =>
        this.logger.warn({
          roleId: id,
          action: 'ROLE_UPDATED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao registar auditoria de actualização de role',
        }),
      );

    return updated;
  }

  async remove(id: number) {
    // Guarda "role de sistema não pode ser removido" removida daqui — lia
    // Role.isSystem, campo que nunca existiu no schema (ver findAll()).
    const role = await this.findOne(id);
    if (role._count.users > 0)
      throw new ConflictException(
        `Role tem ${role._count.users} utilizador(es) atribuídos — reatribua antes de remover`,
      );
    // RolePermission (não Permission) tem ON DELETE CASCADE em roleId — remover
    // um role apaga só as linhas de associação, nunca as permissões em si
    // (catálogo independente, M2M). Já não é preciso libertar permissões
    // antes de remover, ao contrário do design anterior de FK single-owner.

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
      .catch(e =>
        this.logger.warn({
          roleId: id,
          action: 'ROLE_DELETED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao registar auditoria de remoção de role',
        }),
      );

    return { message: 'Role removido com sucesso', roleName: role.name };
  }

  // M2M via RolePermission: clonar cria novas linhas de associação para o
  // clone — duplica de facto as permissões do role de origem, que mantém as
  // suas. Antes disto (FK single-owner), "clonar" na prática roubava as
  // permissões do role de origem.
  async cloneRole(id: number, newName: string) {
    const source = await this.findOne(id);
    const exists = await this.prisma.role.findFirst({ where: { name: newName } });
    if (exists) throw new ConflictException('Nome de role já existe');

    const clone = await this.prisma.role.create({
      data: {
        name: newName,
        code: newName.toUpperCase().replace(/\s+/g, '_'),
        description: `Clone de: ${source.name}`,
      },
    });
    if (source.permissions.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: source.permissions.map(p => ({ roleId: clone.id, permissionId: p.id })),
      });
    }
    return this.findOne(clone.id);
  }

  // ══════════════════════════════════════════════════════
  // USER ↔ ROLE ASSIGNMENT
  // ══════════════════════════════════════════════════════

  async assignToUser(userId: number, roleId: number) {
    await this.findOne(roleId);
    const raw = await this.prisma.user.update({
      where: { id: userId },
      data: { roleId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });
    const user = { ...raw, role: withFlatPermissions(raw.role) };

    await this.prisma.notificationLog
      .create({
        data: {
          userId,
          type: 'ROLE_CHANGED',
          message: `O teu perfil de acesso foi actualizado para: ${user.role?.name}`,
          metadata: JSON.stringify({}),
        },
      })
      .catch(e =>
        this.logger.warn({
          userId,
          roleId,
          action: 'ROLE_CHANGED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao notificar utilizador de mudança de role',
        }),
      );

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
      .catch(e =>
        this.logger.warn({
          userId,
          roleId,
          action: 'ROLE_ASSIGNED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao registar auditoria de atribuição de role',
        }),
      );

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
    await this.prisma.rolePermission.createMany({
      data: permissionIds.map(permissionId => ({ roleId, permissionId })),
      skipDuplicates: true,
    });
    return this.findOne(roleId);
  }

  // M2M via RolePermission: remover é um delete real da associação — a
  // permissão continua a existir no catálogo, só deixa de pertencer a este
  // role (antes, com Permission.roleId como FK obrigatória, "remover"
  // reatribuía a permissão ao ADMIN em vez de a desligar de facto).
  async removePermissionsFromRole(roleId: number, permissionIds: number[]) {
    await this.findOne(roleId);
    await this.prisma.rolePermission.deleteMany({
      where: { roleId, permissionId: { in: permissionIds } },
    });
    return this.findOne(roleId);
  }

  // Substitui o conjunto de permissões do role pela lista dada — diff entre
  // o estado actual e o pedido, em vez de {set:[...]} (que na relação antiga
  // implicava um disconnect implícito; aqui é só limpeza + inserção directa
  // na tabela de associação).
  private async replacePermissionsForRole(roleId: number, permissionIds: number[]) {
    const current = await this.prisma.read.rolePermission.findMany({
      where: { roleId },
      select: { permissionId: true },
    });
    const currentIds = current.map(rp => rp.permissionId);
    const toRemove = currentIds.filter(id => !permissionIds.includes(id));
    const toAdd = permissionIds.filter(id => !currentIds.includes(id));

    if (toRemove.length) {
      await this.prisma.rolePermission.deleteMany({
        where: { roleId, permissionId: { in: toRemove } },
      });
    }
    if (toAdd.length) {
      await this.prisma.rolePermission.createMany({
        data: toAdd.map(permissionId => ({ roleId, permissionId })),
        skipDuplicates: true,
      });
    }
  }

  async setRolePermissions(roleId: number, permissionIds: number[]) {
    await this.findOne(roleId);
    await this.replacePermissionsForRole(roleId, permissionIds);
    return this.findOne(roleId);
  }

  // ══════════════════════════════════════════════════════
  // PERMISSION MATRIX
  // ══════════════════════════════════════════════════════

  async getPermissionMatrix() {
    const [rawRoles, permissions] = await Promise.all([
      this.prisma.read.role.findMany({
        include: {
          rolePermissions: { include: { permission: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.read.permission.findMany({ orderBy: [{ subject: 'asc' }, { action: 'asc' }] }),
    ]);
    const roles = rawRoles.map(({ rolePermissions, ...r }) => ({
      ...r,
      permissions: flattenRolePermissions(rolePermissions),
    }));

    // Group permissions by subject
    const grouped: Record<string, Permission[]> = {};
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
      roles: roles.map(r => ({ id: r.id, name: r.name, code: r.code })),
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
    const permsA = new Set(a.permissions.map(p => p.name));
    const permsB = new Set(b.permissions.map(p => p.name));

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
    const raw = await this.prisma.read.user.findUnique({
      where: { id: dto.userId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });
    if (!raw) throw new NotFoundException('Utilizador não encontrado');
    const user = { ...raw, role: withFlatPermissions(raw.role) };

    const rolePerms = user.role?.permissions ?? [];
    const permName = `${dto.resource.toLowerCase()}:${dto.action.toLowerCase()}`;
    // `p.action === '*'` removido: Permission.action é o enum PermissionAction
    // (VIEW/CREATE/UPDATE/DELETE), nunca tem valor '*' — só Permission.name
    // (String livre) representa wildcard, mesma convenção de acl.service.ts.
    const hasWildcard = rolePerms.some(p => p.name === '*');
    const hasPerm =
      hasWildcard ||
      rolePerms.some(
        p =>
          p.name === permName ||
          (p.subject === dto.resource.toUpperCase() && p.action === dto.action.toUpperCase()),
      );

    const matchedPerm = rolePerms.find(
      p =>
        p.name === permName ||
        (p.subject === dto.resource.toUpperCase() && p.action === dto.action.toUpperCase()),
    );

    return {
      userId: dto.userId,
      user: { id: user.id, fullName: user.fullName, email: user.email },
      role: { id: user.role?.id, name: user.role?.name, code: user.role?.code },
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
    // RoleTemplate é um modelo real (não é o caso ApiKey/Webhook do
    // api-integration.service.ts) — o .catch() aqui é só resiliência a
    // falhas de BD genuínas, não degradação de modelo ausente.
    const query = this.prisma.roleTemplate.findMany({
      include: { role: { select: { id: true, name: true, code: true } } },
      orderBy: { positionName: 'asc' },
    });
    type PositionTemplate = Awaited<typeof query>;
    const result: PositionTemplate = await query.catch((e: unknown) => {
      this.logger.warn({
        entity: 'roleTemplate',
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao obter templates de posição',
      });
      return [];
    });
    return result;
  }

  async createPositionTemplate(dto: RoleTemplateDto) {
    return this.prisma.roleTemplate
      .create({
        data: {
          positionName: dto.positionName,
          roleId: dto.roleId,
          positionId: dto.positionId,
        },
      })
      .catch(e => {
        this.logger.warn({
          positionName: dto.positionName,
          roleId: dto.roleId,
          positionId: dto.positionId,
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao criar template de posição (modelo roleTemplate pode estar ausente — execute migration)',
        });
        return {
          message: 'Template registado (modelo roleTemplate ausente — execute migration)',
          ...dto,
        };
      });
  }

  async applyPositionTemplate(positionId: number) {
    // Find template for this position
    const template = await this.prisma.roleTemplate
      .findFirst({
        where: { positionId },
      })
      .catch(e => {
        this.logger.warn({
          positionId,
          entity: 'roleTemplate',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao procurar template de posição (modelo roleTemplate pode estar ausente)',
        });
        return null;
      });

    if (!template) return { applied: 0, message: 'Sem template para esta posição' };

    // Apply role to all users in this position
    const users = await this.prisma.read.user.findMany({
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
      this.prisma.read.role.count(),
      this.prisma.read.permission.count(),
      this.prisma.read.user.count({ where: { active: true, roleId: null } }),
      this.prisma.read.auditLog.count({ where: { action: 'ACCESS_DENIED' } }).catch(e => {
        this.logger.warn({
          entity: 'auditLog',
          action: 'ACCESS_DENIED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao contar acessos negados para estatísticas de governança',
        });
        return 0;
      }),
      this.prisma.user
        .groupBy({
          by: ['roleId'],
          where: { active: true },
          _count: { id: true },
        })
        .then(async rows => {
          const ids = rows.map(r => r.roleId).filter(Boolean);
          const rols = await this.prisma.read.role.findMany({
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
    const unusedRoles = await this.prisma.read.role.findMany({
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
    return this.prisma.read.user.findMany({
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
    return this.prisma.read.user.findMany({
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
