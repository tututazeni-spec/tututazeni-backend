// src/automation/automation-access.service.ts
// §10 — permissões do módulo por perfil (consultar, criar, editar, testar, activar,
// executar, cancelar, eliminar) e limitação do acesso por departamento.
// ADMIN tem sempre tudo e não é editável; os restantes perfis seguem a matriz
// gravada em AutomationRolePermission (ou o valor por omissão abaixo).
import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/decorators';
import { UpdateRolePermissionDto } from './automation-governance.dto';
import { AutomationAuditService, diffFields } from './automation-audit.service';

export const AUTOMATION_ACTIONS = [
  'view',
  'create',
  'edit',
  'test',
  'activate',
  'execute',
  'cancel',
  'delete',
] as const;
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number];

export type PermissionScope = 'ALL' | 'DEPARTMENT';

export interface RoleGrant {
  roleCode: string;
  actions: Record<AutomationAction, boolean>;
  scope: PermissionScope;
}

const ALL_TRUE = Object.fromEntries(AUTOMATION_ACTIONS.map(a => [a, true])) as Record<
  AutomationAction,
  boolean
>;
const ALL_FALSE = Object.fromEntries(AUTOMATION_ACTIONS.map(a => [a, false])) as Record<
  AutomationAction,
  boolean
>;

/** Perfis que chegam ao módulo (ver @Roles do controller) — o ADMIN nunca é restringido. */
export const MANAGED_ROLES = ['ADMIN', 'RH'] as const;

export const DEFAULT_GRANTS: Record<string, RoleGrant> = {
  ADMIN: { roleCode: 'ADMIN', actions: ALL_TRUE, scope: 'ALL' },
  // O RH opera o módulo mas não elimina automações (decisão de omissão; configurável).
  RH: { roleCode: 'RH', actions: { ...ALL_TRUE, delete: false }, scope: 'ALL' },
};

interface PermRow {
  roleCode: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canTest: boolean;
  canActivate: boolean;
  canExecute: boolean;
  canCancel: boolean;
  canDelete: boolean;
  scope: string;
}

const COLUMN: Record<AutomationAction, keyof PermRow> = {
  view: 'canView',
  create: 'canCreate',
  edit: 'canEdit',
  test: 'canTest',
  activate: 'canActivate',
  execute: 'canExecute',
  cancel: 'canCancel',
  delete: 'canDelete',
};

function rowToGrant(r: PermRow): RoleGrant {
  const actions = { ...ALL_FALSE };
  for (const a of AUTOMATION_ACTIONS) actions[a] = r[COLUMN[a]] as boolean;
  return { roleCode: r.roleCode, actions, scope: r.scope === 'DEPARTMENT' ? 'DEPARTMENT' : 'ALL' };
}

/** A regra pertence ao âmbito do departamento? (departmentIds é um JSON array de strings) */
export function ruleInDepartment(departmentIdsJson: string | null, departmentId: number | null) {
  if (departmentId === null || !departmentIdsJson) return false;
  try {
    const ids = JSON.parse(departmentIdsJson) as unknown;
    return Array.isArray(ids) && ids.map(String).includes(String(departmentId));
  } catch {
    return false;
  }
}

@Injectable()
export class AutomationAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AutomationAuditService,
  ) {}

  private roleOf(user: CurrentUserData): string {
    return user.role?.name ?? '';
  }

  async grantFor(roleCode: string): Promise<RoleGrant> {
    if (roleCode === 'ADMIN') return DEFAULT_GRANTS.ADMIN;
    const row = await this.prisma.automationRolePermission
      .findUnique({ where: { roleCode } })
      .catch(() => null);
    if (row) return rowToGrant(row);
    return DEFAULT_GRANTS[roleCode] ?? { roleCode, actions: { ...ALL_FALSE }, scope: 'ALL' };
  }

  async can(user: CurrentUserData, action: AutomationAction): Promise<boolean> {
    return (await this.grantFor(this.roleOf(user))).actions[action];
  }

  private async departmentOf(userId: number): Promise<number | null> {
    const u = await this.prisma.read.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    });
    return u?.departmentId ?? null;
  }

  /**
   * Garante a permissão e, para perfis com âmbito DEPARTMENT, que a automação
   * indicada pertence ao departamento do utilizador.
   */
  async assert(user: CurrentUserData, action: AutomationAction, ruleId?: number): Promise<void> {
    const grant = await this.grantFor(this.roleOf(user));
    if (!grant.actions[action]) {
      throw new ForbiddenException(`Sem permissão para "${action}" no módulo de automações`);
    }
    if (ruleId !== undefined && grant.scope === 'DEPARTMENT') {
      const rule = await this.prisma.automationRule.findUnique({
        where: { id: ruleId },
        select: { departmentIds: true },
      });
      // Regra inexistente: deixa o serviço responder 404 em vez de mascarar.
      if (rule && !ruleInDepartment(rule.departmentIds, await this.departmentOf(user.id))) {
        throw new ForbiddenException('Esta automação está fora do seu departamento');
      }
    }
  }

  /** null = sem restrição; caso contrário, os ids das automações visíveis ao utilizador. */
  async scopedRuleIds(user: CurrentUserData): Promise<number[] | null> {
    const grant = await this.grantFor(this.roleOf(user));
    if (grant.scope !== 'DEPARTMENT') return null;
    const dept = await this.departmentOf(user.id);
    if (dept === null) return [];
    const rules = await this.prisma.read.automationRule.findMany({
      where: { departmentIds: { contains: `"${dept}"` } },
      select: { id: true, departmentIds: true },
    });
    return rules.filter(r => ruleInDepartment(r.departmentIds, dept)).map(r => r.id);
  }

  // ─── Matriz de permissões (administração) ─────────────────────

  async matrix() {
    const rows = await this.prisma.automationRolePermission.findMany();
    const byRole = new Map(rows.map(r => [r.roleCode, rowToGrant(r)]));
    const roles = [...new Set([...MANAGED_ROLES, ...byRole.keys()])];
    return {
      actions: AUTOMATION_ACTIONS,
      scopes: ['ALL', 'DEPARTMENT'],
      roles: roles.map(code => ({
        ...(byRole.get(code) ?? DEFAULT_GRANTS[code]),
        locked: code === 'ADMIN',
        custom: byRole.has(code),
      })),
    };
  }

  async updateRole(roleCode: string, dto: UpdateRolePermissionDto, userId: number) {
    if (roleCode === 'ADMIN') {
      throw new ForbiddenException('As permissões do perfil ADMIN não podem ser alteradas');
    }
    const role = await this.prisma.read.role.findFirst({
      where: { name: roleCode },
      select: { id: true },
    });
    if (!role) throw new ForbiddenException(`Perfil "${roleCode}" inexistente`);
    const before = await this.grantFor(roleCode);
    const data: Record<string, unknown> = {};
    for (const a of AUTOMATION_ACTIONS) {
      const v = dto[a];
      if (v !== undefined) data[COLUMN[a]] = v;
    }
    if (dto.scope) data.scope = dto.scope;
    // Sem consulta não há acções que façam sentido: retirar `view` retira tudo.
    if (data.canView === false) for (const a of AUTOMATION_ACTIONS) data[COLUMN[a]] = false;
    const row = await this.prisma.automationRolePermission.upsert({
      where: { roleCode },
      create: { roleCode, ...rowDefaults(before), ...data, updatedBy: userId },
      update: { ...data, updatedBy: userId },
    });
    const after = rowToGrant(row);
    const changed = diffFields(
      { ...before.actions, scope: before.scope },
      { ...after.actions, scope: after.scope },
    );
    await this.audit.record({
      entity: 'PERMISSION',
      action: 'PERMISSION_UPDATED',
      entityId: roleCode,
      userId,
      ...changed,
    });
    return after;
  }
}

function rowDefaults(g: RoleGrant) {
  return {
    canView: g.actions.view,
    canCreate: g.actions.create,
    canEdit: g.actions.edit,
    canTest: g.actions.test,
    canActivate: g.actions.activate,
    canExecute: g.actions.execute,
    canCancel: g.actions.cancel,
    canDelete: g.actions.delete,
    scope: g.scope,
  };
}
