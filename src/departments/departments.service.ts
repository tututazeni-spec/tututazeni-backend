// src/departments/departments.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
  DepartmentFilterDto,
  TransferMemberDto,
  BulkTransferDto,
  CreateUnitDto,
  UpdateUnitDto,
  CreatePositionDto,
  UpdatePositionDto,
  PositionFilterDto,
  CreateCareerPositionDto,
  EmployeeFilterDto,
  HierarchyFilterDto,
  HistoryFilterDto,
  ReportsFilterDto,
} from './departments.dto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────

@Injectable()
export class DepartmentsService {
  private readonly logger = new Logger(DepartmentsService.name);

  // Campos simples rastreados no histórico de alterações (docs/modulo_departments.md
  // Ponto 8) — exclui active/status (eventos dedicados deactivate/activate/archive)
  // e headId (já tem o seu próprio DepartmentHeadHistory).
  private readonly TRACKED_FIELDS: Array<{ key: keyof UpdateDepartmentDto; label: string }> = [
    { key: 'name', label: 'Nome' },
    { key: 'acronym', label: 'Sigla' },
    { key: 'location', label: 'Localização' },
    { key: 'costCenter', label: 'Centro de custo' },
    { key: 'maxEmployees', label: 'Limite máximo de colaboradores' },
    { key: 'expectedEmployees', label: 'Headcount previsto' },
    { key: 'businessArea', label: 'Área de negócio' },
    { key: 'functionalArea', label: 'Área funcional' },
    { key: 'objective', label: 'Objectivo' },
  ];

  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Validar que não há loop hierárquico (A → B → A)
  private async detectCircularHierarchy(id: number, newParentId: number): Promise<boolean> {
    let current = newParentId;
    const visited = new Set<number>();
    while (current) {
      if (current === id) return true;
      if (visited.has(current)) break;
      visited.add(current);
      const dept = await this.prisma.department.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      if (!dept?.parentId) break;
      current = dept.parentId;
    }
    return false;
  }

  // Partilhado por findAll() e exportCsv() — mesmos filtros, com ou sem paginação.
  private buildWhere(filters: DepartmentFilterDto): Prisma.DepartmentWhereInput {
    const {
      search,
      active,
      parentId,
      rootOnly,
      status,
      unitId,
      headId,
      location,
      createdFrom,
      createdTo,
    } = filters;

    const where: Prisma.DepartmentWhereInput = {};
    if (active !== undefined) where.active = active;
    if (parentId !== undefined) where.parentId = parentId;
    if (rootOnly) where.parentId = null;
    if (status !== undefined) where.status = status;
    if (unitId !== undefined) where.unitId = unitId;
    if (headId !== undefined) where.headId = headId;
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (createdFrom || createdTo) {
      where.createdAt = {
        ...(createdFrom ? { gte: new Date(createdFrom) } : {}),
        ...(createdTo ? { lte: new Date(createdTo) } : {}),
      };
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { acronym: { contains: search, mode: 'insensitive' } },
        { head: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  async findAll(filters: DepartmentFilterDto) {
    const { page = 1, limit = 30 } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where = this.buildWhere(filters);

    const [data, total] = await Promise.all([
      this.prisma.read.department.findMany({
        where,
        skip,
        take,
        include: {
          head: { select: { id: true, fullName: true, email: true } },
          parent: { select: { id: true, name: true, code: true } },
          unit: { select: { id: true, name: true, code: true } },
          children: { select: { id: true, name: true, code: true, active: true } },
          _count: { select: { users: true, children: true } },
        },
        orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.read.department.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  // Tabela "Departamentos" (docs/modulo_departments.md Ponto 2) exportada como
  // CSV — mesmos filtros de findAll(), sem paginação.
  async exportCsv(filters: DepartmentFilterDto) {
    const where = this.buildWhere(filters);
    const rows = await this.prisma.read.department.findMany({
      where,
      include: {
        head: { select: { fullName: true } },
        parent: { select: { name: true } },
        unit: { select: { name: true } },
        _count: { select: { users: true, children: true } },
      },
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
    });

    const headers = [
      'Nome',
      'Código',
      'Sigla',
      'Departamento superior',
      'Unidade/empresa',
      'Responsável',
      'N.º de colaboradores',
      'N.º de subdepartamentos',
      'Localização',
      'Estado',
      'Data de criação',
      'Última atualização',
    ];
    const escape = (v: string) =>
      v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    const lines = rows.map(d =>
      [
        d.name,
        d.code,
        d.acronym ?? '',
        d.parent?.name ?? '',
        d.unit?.name ?? '',
        d.head?.fullName ?? '',
        String(d._count.users),
        String(d._count.children),
        d.location ?? '',
        d.status,
        d.createdAt.toISOString().slice(0, 10),
        d.updatedAt.toISOString().slice(0, 10),
      ]
        .map(escape)
        .join(','),
    );
    return [headers.join(','), ...lines].join('\n');
  }

  // Árvore hierárquica completa (para org chart)
  async getTree() {
    const [all, positionCounts] = await Promise.all([
      this.prisma.read.department.findMany({
        where: { active: true },
        include: {
          head: { select: { id: true, fullName: true, email: true } },
          unit: { select: { id: true, name: true } },
          _count: { select: { users: true, children: true } },
        },
        orderBy: { name: 'asc' },
      }),
      // groupBy em vez de include/_count — mantém a árvore como uma única
      // query independente da lista de posições.
      this.prisma.read.position.groupBy({
        by: ['departmentId'],
        _count: { _all: true },
      }),
    ]);
    const positionsByDept = new Map(
      positionCounts
        .filter((p): p is typeof p & { departmentId: number } => p.departmentId !== null)
        .map(p => [p.departmentId, p._count._all]),
    );

    // Construir árvore recursivamente, anotando nível hierárquico e nº de cargos
    // (docs/modulo_departments.md Ponto 3 — Estrutura Organizacional)
    type DepartmentNode = (typeof all)[number] & {
      children: DepartmentNode[];
      level: number;
      positionsCount: number;
    };
    const buildTree = (parentId: number | null, level: number): DepartmentNode[] =>
      all
        .filter(d => d.parentId === parentId)
        .map(d => ({
          ...d,
          level,
          positionsCount: positionsByDept.get(d.id) ?? 0,
          children: buildTree(d.id, level + 1),
        }));

    return buildTree(null, 0);
  }

  async findOne(id: number) {
    const d = await this.prisma.read.department.findUnique({
      where: { id },
      include: {
        head: { select: { id: true, fullName: true, email: true, position: true } },
        deputyHead: { select: { id: true, fullName: true, email: true } },
        parent: { select: { id: true, name: true, code: true } },
        unit: { select: { id: true, name: true } },
        processOwnerDepartment: { select: { id: true, name: true, code: true } },
        children: {
          where: { active: true },
          include: {
            head: { select: { id: true, fullName: true } },
            _count: { select: { users: true } },
          },
        },
        users: {
          select: {
            id: true,
            fullName: true,
            email: true,
            active: true,
            position: { select: { name: true } },
          },
          where: { active: true },
          take: 50,
        },
        headHistory: {
          include: { head: { select: { id: true, fullName: true } } },
          orderBy: { startedAt: 'desc' },
          take: 10,
        },
        _count: { select: { users: true, children: true } },
      },
    });
    if (!d) throw new NotFoundException('Departamento não encontrado');
    return d;
  }

  async create(dto: CreateDepartmentDto, createdById: number) {
    // Validar código único (case-insensitive; persistido em UPPERCASE)
    const code = dto.code.toUpperCase();
    const codeExists = await this.prisma.department.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
    });
    if (codeExists) throw new ConflictException(`Código ${code} já existe`);

    // Validar parentId
    if (dto.parentId) {
      const parent = await this.prisma.department.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Departamento pai não encontrado');
    }

    // active é a fonte de verdade; status é espelhado (campos redundantes no schema)
    const active = dto.status ? dto.status === 'ACTIVE' : true;

    const dept = await this.prisma.department.create({
      data: {
        name: dto.name,
        code,
        acronym: dto.acronym,
        description: dto.description,
        parentId: dto.parentId,
        headId: dto.headId,
        deputyHeadId: dto.deputyHeadId,
        directManagerId: dto.directManagerId,
        color: dto.color,
        icon: dto.icon,
        costCenter: dto.costCenter,
        trainingBudget: dto.trainingBudget,
        annualBudget: dto.annualBudget,
        unitId: dto.unitId,
        maxEmployees: dto.maxEmployees,
        operationalStartDate: dto.operationalStartDate
          ? new Date(dto.operationalStartDate)
          : undefined,
        institutionalEmail: dto.institutionalEmail,
        phoneExtension: dto.phoneExtension,
        location: dto.location,
        physicalLocation: dto.physicalLocation,
        objective: dto.objective,
        mainResponsibilities: dto.mainResponsibilities,
        functionalArea: dto.functionalArea,
        businessArea: dto.businessArea,
        isStrategic: dto.isStrategic ?? false,
        notes: dto.notes,
        expectedEmployees: dto.expectedEmployees,
        institutionalContact: dto.institutionalContact,
        dataVisibility: dto.dataVisibility,
        approvalRequired: dto.approvalRequired ?? false,
        approverIds: dto.approverIds ?? [],
        processOwnerDepartmentId: dto.processOwnerDepartmentId,
        active,
        status: active ? 'ACTIVE' : 'INACTIVE',
      },
      include: {
        head: { select: { id: true, fullName: true } },
        parent: { select: { id: true, name: true, code: true } },
      },
    });

    // Registar gestor inicial no histórico
    if (dto.headId) {
      await this.prisma.departmentHeadHistory.create({
        data: { departmentId: dept.id, headId: dto.headId, startedAt: new Date() },
      });
    }

    // Histórico (docs/modulo_departments.md Ponto 8) — "Departamento criado"
    await this.audit.log({
      action: 'CREATE',
      entity: 'Department',
      entityId: dept.id,
      userId: createdById,
      metadata: { name: dept.name, code: dept.code },
    });
    // "Subdepartamento criado" — fica também no histórico do departamento-pai
    if (dto.parentId) {
      await this.audit.log({
        action: 'CHILD_CREATED',
        entity: 'Department',
        entityId: dto.parentId,
        userId: createdById,
        metadata: { childId: dept.id, childName: dept.name },
      });
    }

    return dept;
  }

  async update(id: number, dto: UpdateDepartmentDto, changedById?: number) {
    const existing = await this.findOne(id);

    // Validar código único (case-insensitive; persistido em UPPERCASE)
    const nextCode = dto.code ? dto.code.toUpperCase() : undefined;
    if (nextCode && nextCode !== existing.code) {
      const codeExists = await this.prisma.department.findFirst({
        where: { code: { equals: nextCode, mode: 'insensitive' }, id: { not: id } },
      });
      if (codeExists) throw new ConflictException(`Código ${nextCode} já em uso`);
    }

    // Headcount: limite não pode ser inferior ao previsto nem à ocupação actual
    const nextMax = dto.maxEmployees !== undefined ? dto.maxEmployees : existing.maxEmployees;
    const nextExpected =
      dto.expectedEmployees !== undefined ? dto.expectedEmployees : existing.expectedEmployees;
    if (nextMax != null && nextExpected != null && nextExpected > nextMax) {
      throw new BadRequestException('O headcount previsto não pode exceder o limite máximo');
    }
    if (dto.maxEmployees != null && dto.maxEmployees !== existing.maxEmployees) {
      const current = await this.prisma.user.count({
        where: { departmentId: id, active: true },
      });
      if (dto.maxEmployees < current) {
        throw new BadRequestException(
          `O limite não pode ser inferior aos colaboradores activos actuais (${current})`,
        );
      }
    }

    // Validar hierarquia circular
    if (dto.parentId && dto.parentId === id) {
      throw new BadRequestException('Departamento não pode ser pai de si próprio');
    }
    if (dto.parentId && dto.parentId !== existing.parentId) {
      const isCircular = await this.detectCircularHierarchy(id, dto.parentId);
      if (isCircular) throw new BadRequestException('Hierarquia circular detectada');
    }

    // Gestor mudou → registar histórico
    if (dto.headId && dto.headId !== existing.headId) {
      await this.prisma.departmentHeadHistory.updateMany({
        where: { departmentId: id, endedAt: null },
        data: { endedAt: new Date() },
      });
      await this.prisma.departmentHeadHistory.create({
        data: {
          departmentId: id,
          headId: dto.headId,
          startedAt: new Date(),
          reason: dto.headChangeReason,
          changedById,
        },
      });
    }

    // active é a fonte de verdade; se o DTO trouxer status, espelha-se em active
    const {
      status,
      code: _code,
      operationalStartDate,
      headChangeReason: _headChangeReason,
      ...rest
    } = dto;
    const data: Prisma.DepartmentUncheckedUpdateInput = { ...rest };
    if (nextCode) data.code = nextCode;
    if (status !== undefined) {
      data.status = status;
      data.active = status === 'ACTIVE';
    }
    if (operationalStartDate !== undefined) {
      data.operationalStartDate = new Date(operationalStartDate);
    }

    const updated = await this.prisma.department.update({
      where: { id },
      data,
      include: {
        head: { select: { id: true, fullName: true } },
        parent: { select: { id: true, name: true, code: true } },
        deputyHead: { select: { id: true, fullName: true } },
        unit: { select: { id: true, name: true } },
        _count: { select: { users: true } },
      },
    });

    // Histórico (docs/modulo_departments.md Ponto 8) — um registo por campo
    // alterado, só quando sabemos quem fez a alteração (chamadas internas sem
    // changedById não geram histórico — mantém o comportamento anterior).
    if (changedById !== undefined) {
      const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
      const existingRecord = existing as unknown as Record<string, unknown>;
      const updatedRecord = updated as unknown as Record<string, unknown>;
      for (const f of this.TRACKED_FIELDS) {
        const before = existingRecord[f.key as string];
        const after = updatedRecord[f.key as string];
        if (before !== after && !(before == null && after == null)) {
          changes.push({ field: f.label, before: before ?? null, after: after ?? null });
        }
      }
      if (dto.parentId !== undefined && dto.parentId !== existing.parentId) {
        changes.push({
          field: 'Departamento superior',
          before: existing.parent?.name ?? null,
          after: updated.parent?.name ?? null,
        });
      }
      if (dto.unitId !== undefined && dto.unitId !== existing.unitId) {
        changes.push({
          field: 'Unidade',
          before: existing.unit?.name ?? null,
          after: updated.unit?.name ?? null,
        });
      }
      if (dto.deputyHeadId !== undefined && dto.deputyHeadId !== existing.deputyHeadId) {
        changes.push({
          field: 'Substituto do responsável',
          before: existing.deputyHead?.fullName ?? null,
          after: updated.deputyHead?.fullName ?? null,
        });
      }
      if (changes.length) {
        await this.audit.log({
          action: 'UPDATE',
          entity: 'Department',
          entityId: id,
          userId: changedById,
          metadata: { changes },
        });
      }
      if (status !== undefined && status !== existing.status) {
        await this.audit.log({
          action: status === 'ACTIVE' ? 'ACTIVATE' : 'DEACTIVATE',
          entity: 'Department',
          entityId: id,
          userId: changedById,
          metadata: {},
        });
      }
    }

    return updated;
  }

  // Soft deactivate — preserva histórico
  async deactivate(id: number, performedById: number) {
    const d = await this.findOne(id);
    const activeUsers = d._count.users;
    if (activeUsers > 0) {
      throw new BadRequestException(
        `Departamento tem ${activeUsers} colaboradores activos. Transfira-os primeiro.`,
      );
    }
    const updated = await this.prisma.department.update({
      where: { id },
      data: { active: false, status: 'INACTIVE' },
    });
    await this.audit.log({
      action: 'DEACTIVATE',
      entity: 'Department',
      entityId: id,
      userId: performedById,
      metadata: {},
    });
    return updated;
  }

  async activate(id: number, performedById: number) {
    await this.findOne(id);
    const updated = await this.prisma.department.update({
      where: { id },
      data: { active: true, status: 'ACTIVE', closedAt: null, closureReason: null },
    });
    await this.audit.log({
      action: 'ACTIVATE',
      entity: 'Department',
      entityId: id,
      userId: performedById,
      metadata: {},
    });
    return updated;
  }

  // Arquivar — mais forte que desactivar: regista data/motivo de
  // encerramento (docs/modulo_departments.md Ponto 2, secção "Estado").
  // Reactiva-se com activate(), que limpa closedAt/closureReason.
  async archive(id: number, reason: string | undefined, performedById: number) {
    const d = await this.findOne(id);
    const activeUsers = d._count.users;
    if (activeUsers > 0) {
      throw new BadRequestException(
        `Departamento tem ${activeUsers} colaboradores activos. Transfira-os primeiro.`,
      );
    }
    const updated = await this.prisma.department.update({
      where: { id },
      data: {
        active: false,
        status: 'ARCHIVED',
        closedAt: new Date(),
        closureReason: reason,
      },
    });
    await this.audit.log({
      action: 'ARCHIVE',
      entity: 'Department',
      entityId: id,
      userId: performedById,
      metadata: { reason: reason ?? null },
    });
    return updated;
  }

  // Hard-delete guardado — alvo do DELETE /organization/departments/:id.
  // Só elimina departamentos sem colaboradores e sem sub-departamentos.
  async remove(id: number, performedById: number) {
    const dept = await this.prisma.read.department.findUnique({
      where: { id },
      include: { _count: { select: { users: true, children: true } } },
    });
    if (!dept) throw new NotFoundException('Departamento não encontrado');
    if (dept._count.users > 0) {
      throw new BadRequestException(
        `Departamento tem ${dept._count.users} colaboradores. Transfira-os primeiro.`,
      );
    }
    if (dept._count.children > 0) {
      throw new BadRequestException('Departamento tem sub-departamentos. Elimine-os primeiro.');
    }
    // Entidade vai ser eliminada — nome/código ficam só nos metadados do
    // histórico (AuditLog não tem FK real para Department).
    await this.audit.log({
      action: 'DELETE',
      entity: 'Department',
      entityId: id,
      userId: performedById,
      metadata: { name: dept.name, code: dept.code },
    });
    await this.prisma.department.delete({ where: { id } });
    return { message: 'Departamento eliminado' };
  }

  // Transferir membro entre departamentos
  async transferMember(dto: TransferMemberDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException(`Utilizador #${dto.userId} não encontrado`);

    const target = await this.prisma.department.findUnique({
      where: { id: dto.targetDepartmentId },
    });
    if (!target || !target.active)
      throw new NotFoundException('Departamento de destino não encontrado ou inactivo');

    const previousDeptId = user.departmentId;

    // Limite máximo de colaboradores (activos) do departamento de destino
    if (target.maxEmployees != null && previousDeptId !== target.id && user.active) {
      const current = await this.prisma.user.count({
        where: { departmentId: target.id, active: true },
      });
      if (current >= target.maxEmployees) {
        throw new BadRequestException(
          `Limite de colaboradores atingido em "${target.name}" (${current}/${target.maxEmployees})`,
        );
      }
    }

    await this.prisma.user.update({
      where: { id: dto.userId },
      data: { departmentId: dto.targetDepartmentId },
    });

    // Registar histórico de transferência
    await this.prisma.departmentTransferLog.create({
      data: {
        userId: dto.userId,
        fromDepartmentId: previousDeptId,
        toDepartmentId: dto.targetDepartmentId,
        reason: dto.reason,
        transferredAt: new Date(),
      },
    });

    return {
      message: 'Transferência realizada com sucesso',
      userId: dto.userId,
      targetDepartmentId: dto.targetDepartmentId,
    };
  }

  // Transferência em massa
  async bulkTransfer(dto: BulkTransferDto) {
    const target = await this.prisma.department.findUnique({
      where: { id: dto.targetDepartmentId },
    });
    if (!target || !target.active)
      throw new NotFoundException('Departamento de destino não encontrado');

    const results = { transferred: 0, errors: [] as string[] };

    for (const userId of dto.userIds) {
      try {
        await this.transferMember({
          userId,
          targetDepartmentId: dto.targetDepartmentId,
          reason: dto.reason,
        });
        results.transferred++;
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        results.errors.push(`User ${userId}: ${message}`);
      }
    }

    return results;
  }

  // Métricas do departamento
  async getMetrics(id: number) {
    const dept = await this.findOne(id);

    const [totalUsers, activeUsers, transfersIn, transfersOut] = await Promise.all([
      this.prisma.read.user.count({ where: { departmentId: id } }),
      this.prisma.read.user.count({ where: { departmentId: id, active: true } }),
      this.prisma.read.departmentTransferLog.count({ where: { toDepartmentId: id } }),
      this.prisma.read.departmentTransferLog.count({ where: { fromDepartmentId: id } }),
    ]);

    // Breadcrumb da hierarquia
    const breadcrumb = await this.buildBreadcrumb(id);

    return {
      departmentId: id,
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      expectedEmployees: dept.expectedEmployees ?? null,
      maxEmployees: dept.maxEmployees ?? null,
      transfers: { in: transfersIn, out: transfersOut },
      breadcrumb,
    };
  }

  // "Estrutura de um departamento" (docs/modulo_departments.md Ponto 2) —
  // Departamento → Subdepartamentos → Equipas → Responsável → Colaboradores →
  // Cargos → Posições. Equipas não tem modelo próprio: agrupa-se os membros
  // activos pelo seu gestor directo (User.managerId), que é a única noção de
  // "equipa" que já existe no schema (ver [[project-innova-leader-module-team-search]]).
  async getStructure(id: number) {
    await this.findOne(id);

    const [members, positions, vacancies, documents, goals] = await Promise.all([
      this.prisma.read.user.findMany({
        where: { departmentId: id, active: true },
        select: {
          id: true,
          fullName: true,
          email: true,
          managerId: true,
          manager: { select: { id: true, fullName: true } },
          position: { select: { id: true, name: true } },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.read.position.findMany({
        where: { departmentId: id },
        include: { _count: { select: { users: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.read.internalVacancy.findMany({
        where: { departmentId: id },
        select: {
          id: true,
          title: true,
          status: true,
          slots: true,
          closingDate: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.read.companyDocument.findMany({
        where: { departmentId: id, active: true },
        select: {
          id: true,
          title: true,
          category: true,
          fileUrl: true,
          fileType: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.read.performanceGoal.findMany({
        where: { user: { departmentId: id } },
        select: {
          id: true,
          title: true,
          status: true,
          progress: true,
          dueDate: true,
          user: { select: { id: true, fullName: true } },
        },
        orderBy: { dueDate: 'asc' },
        take: 30,
      }),
    ]);

    // Equipas: agrupar por gestor directo. Quem não tem manager (ou cujo
    // manager está fora do departamento) fica em "Sem equipa atribuída".
    const teamsByManager = new Map<
      number,
      { manager: { id: number; fullName: string }; members: typeof members }
    >();
    const noTeam: typeof members = [];
    for (const m of members) {
      if (m.manager && m.managerId !== m.id) {
        const entry = teamsByManager.get(m.manager.id);
        if (entry) entry.members.push(m);
        else teamsByManager.set(m.manager.id, { manager: m.manager, members: [m] });
      } else {
        noTeam.push(m);
      }
    }
    const teams = [
      ...Array.from(teamsByManager.values()),
      ...(noTeam.length ? [{ manager: null, members: noTeam }] : []),
    ];

    return {
      departmentId: id,
      teams,
      positions: positions.map(p => ({
        id: p.id,
        name: p.name,
        code: p.code,
        level: p.level,
        headcountPlanned: p.headcountPlanned ?? 0,
        headcountOccupied: p._count.users,
      })),
      vacancies,
      documents,
      goals,
    };
  }

  private async buildBreadcrumb(
    id: number,
  ): Promise<Array<{ id: number; name: string; code: string }>> {
    const trail: Array<{ id: number; name: string; code: string }> = [];
    let current: number | null = id;
    while (current) {
      const dept = await this.prisma.read.department.findUnique({
        where: { id: current },
        select: { id: true, name: true, code: true, parentId: true },
      });
      if (!dept) break;
      trail.unshift({ id: dept.id, name: dept.name, code: dept.code });
      current = dept.parentId;
    }
    return trail;
  }

  // Dashboard comparativo de departamentos
  async getComparativeDashboard() {
    const depts = await this.prisma.read.department.findMany({
      where: { active: true },
      include: {
        _count: { select: { users: true } },
        head: { select: { id: true, fullName: true } },
      },
      orderBy: { name: 'asc' },
    });

    return depts.map(d => ({
      id: d.id,
      name: d.name,
      code: d.code,
      headName: d.head?.fullName ?? '—',
      totalMembers: d._count.users,
      active: d.active,
    }));
  }

  // Responsáveis de todos os departamentos (docs/modulo_departments.md Ponto 4)
  async getHeads() {
    const depts = await this.prisma.read.department.findMany({
      where: { active: true },
      include: {
        head: {
          select: {
            id: true,
            fullName: true,
            email: true,
            position: { select: { name: true } },
          },
        },
        deputyHead: { select: { id: true, fullName: true } },
        _count: { select: { users: true, children: true } },
        headHistory: {
          where: { endedAt: null },
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });

    return depts.map(d => ({
      departmentId: d.id,
      departmentName: d.name,
      departmentCode: d.code,
      head: d.head,
      position: d.head?.position?.name ?? null,
      deputyHead: d.deputyHead,
      startedAt: d.headHistory[0]?.startedAt ?? null,
      status: d.status,
      active: d.active,
      contact: d.head?.email ?? d.institutionalEmail ?? null,
      usersUnderResponsibility: d._count.users,
      subdepartmentsUnderResponsibility: d._count.children,
    }));
  }

  // Histórico de alterações de responsável, agregado entre todos os
  // departamentos (docs/modulo_departments.md Ponto 4 — "Histórico").
  // Distinto do histórico por departamento já devolvido em findOne()/headHistory.
  async getHeadHistory() {
    const entries = await this.prisma.read.departmentHeadHistory.findMany({
      include: {
        department: { select: { id: true, name: true, code: true } },
        head: { select: { id: true, fullName: true } },
        changedBy: { select: { id: true, fullName: true } },
      },
      orderBy: [{ departmentId: 'asc' }, { startedAt: 'asc' }],
    });

    const byDept = new Map<number, typeof entries>();
    for (const e of entries) {
      const arr = byDept.get(e.departmentId) ?? [];
      arr.push(e);
      byDept.set(e.departmentId, arr);
    }

    const result = entries.map(e => {
      const deptEntries = byDept.get(e.departmentId) ?? [];
      const idx = deptEntries.findIndex(x => x.id === e.id);
      const previous = idx > 0 ? deptEntries[idx - 1] : null;
      return {
        id: e.id,
        department: e.department,
        previousHead: previous?.head ?? null,
        newHead: e.head,
        changedAt: e.startedAt,
        endedAt: e.endedAt,
        reason: e.reason,
        changedBy: e.changedBy,
      };
    });

    return result.sort((a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime());
  }

  // Colaboradores alocados aos departamentos, agregado entre toda a
  // organização (docs/modulo_departments.md Ponto 5 — "Colaboradores").
  // Mostra apenas os dados necessários à gestão departamental — os dados
  // completos do colaborador continuam no módulo Users.
  async getEmployees(filters: EmployeeFilterDto) {
    const {
      page = 1,
      limit = 30,
      search,
      departmentId,
      positionId,
      location,
      contractType,
      active,
    } = filters;
    const { skip, take } = calculatePagination(page, limit);

    // "Departamento" no filtro inclui sub-departamentos: resolve-se a árvore
    // completa de ids antes de filtrar os colaboradores.
    let departmentIds: number[] | undefined;
    if (departmentId !== undefined) {
      const allDepts = await this.prisma.read.department.findMany({
        select: { id: true, parentId: true },
      });
      departmentIds = this.collectDescendantIds(allDepts, departmentId);
    }

    const where: Prisma.UserWhereInput = {
      ...(departmentIds ? { departmentId: { in: departmentIds } } : {}),
      ...(positionId !== undefined ? { positionId } : {}),
      ...(contractType !== undefined ? { contractType } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(location
        ? { department: { location: { contains: location, mode: 'insensitive' } } }
        : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { employeeNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const select = {
      id: true,
      fullName: true,
      employeeNumber: true,
      avatarUrl: true,
      email: true,
      phone: true,
      gender: true,
      birthDate: true,
      active: true,
      contractType: true,
      hireDate: true,
      department: {
        select: {
          id: true,
          name: true,
          location: true,
          parentId: true,
          parent: { select: { id: true, name: true } },
        },
      },
      manager: { select: { id: true, fullName: true } },
      position: { select: { id: true, name: true } },
    } satisfies Prisma.UserSelect;

    const [rows, total, indicatorRows] = await Promise.all([
      this.prisma.read.user.findMany({
        where,
        select,
        skip,
        take,
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.read.user.count({ where }),
      // Indicadores calculados sobre o universo filtrado (sem paginação).
      this.prisma.read.user.findMany({
        where,
        select: {
          active: true,
          gender: true,
          birthDate: true,
          contractType: true,
          position: { select: { name: true } },
          department: { select: { location: true } },
        },
      }),
    ]);

    const data = rows.map(u => ({
      id: u.id,
      fullName: u.fullName,
      employeeNumber: u.employeeNumber,
      avatarUrl: u.avatarUrl,
      email: u.email,
      phone: u.phone,
      position: u.position,
      department: u.department
        ? { id: u.department.id, name: u.department.parent?.name ?? u.department.name }
        : null,
      subdepartment: u.department?.parent ? u.department.name : null,
      location: u.department?.location ?? null,
      manager: u.manager,
      hireDate: u.hireDate,
      active: u.active,
      contractType: u.contractType,
    }));

    const ageBracket = (birthDate: Date | null): string => {
      if (!birthDate) return 'Não informado';
      const age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 3600 * 1000));
      if (age < 25) return '< 25';
      if (age < 35) return '25-34';
      if (age < 45) return '35-44';
      if (age < 55) return '45-54';
      return '55+';
    };
    const countBy = <T>(items: T[], key: (item: T) => string | null | undefined) => {
      const map = new Map<string, number>();
      for (const item of items) {
        const k = key(item) ?? 'Não informado';
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
    };

    const indicators = {
      total: indicatorRows.length,
      active: indicatorRows.filter(u => u.active).length,
      inactive: indicatorRows.filter(u => !u.active).length,
      byGender: countBy(indicatorRows, u => u.gender),
      byAgeBracket: countBy(indicatorRows, u => ageBracket(u.birthDate)),
      byPosition: countBy(indicatorRows, u => u.position?.name),
      byLocation: countBy(indicatorRows, u => u.department?.location),
      byContractType: countBy(indicatorRows, u => u.contractType),
    };

    return { ...buildPaginatedResponse(data, total, page, limit), indicators };
  }

  // Catálogo de cargos (docs/modulo_departments.md Ponto 6 — "Cargos &
  // Funções"), com filtros, paginação e indicadores — distinto do picker
  // simples em GET /positions (usado por outros módulos, ver PositionsService.findAll).
  async getPositionsCatalog(filters: PositionFilterDto) {
    const { page = 1, limit = 30, search, departmentId, level, jobFamily, active } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.PositionWhereInput = {
      ...(departmentId !== undefined ? { departmentId } : {}),
      ...(level !== undefined ? { level } : {}),
      ...(jobFamily ? { jobFamily: { contains: jobFamily, mode: 'insensitive' } } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { code: { contains: search, mode: 'insensitive' } },
              { jobFunction: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total, indicatorRows] = await Promise.all([
      this.prisma.read.position.findMany({
        where,
        skip,
        take,
        include: {
          department: { select: { id: true, name: true } },
          reportsTo: { select: { id: true, name: true } },
          _count: { select: { users: true, internalVacancies: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.read.position.count({ where }),
      this.prisma.read.position.findMany({
        where,
        select: { active: true, jobFamily: true, level: true },
      }),
    ]);

    const data = rows.map(p => ({
      id: p.id,
      name: p.name,
      code: p.code,
      jobFunction: p.jobFunction,
      jobFamily: p.jobFamily,
      level: p.level,
      department: p.department,
      reportsTo: p.reportsTo,
      headcountPlanned: p.headcountPlanned ?? 0,
      headcountOccupied: p._count.users,
      vacancies: Math.max((p.headcountPlanned ?? 0) - p._count.users, 0),
      active: p.active,
      createdAt: p.createdAt,
    }));

    const countBy = (
      items: typeof indicatorRows,
      key: (i: (typeof indicatorRows)[number]) => string | null | undefined,
    ) => {
      const map = new Map<string, number>();
      for (const item of items) {
        const k = key(item) ?? 'Não informado';
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
    };

    const indicators = {
      total: indicatorRows.length,
      active: indicatorRows.filter(p => p.active).length,
      inactive: indicatorRows.filter(p => !p.active).length,
      byJobFamily: countBy(indicatorRows, p => p.jobFamily),
      byLevel: countBy(indicatorRows, p => p.level),
    };

    return { ...buildPaginatedResponse(data, total, page, limit), indicators };
  }

  private collectDescendantIds(
    all: Array<{ id: number; parentId: number | null }>,
    rootId: number,
  ): number[] {
    const result = [rootId];
    const queue = [rootId];
    while (queue.length) {
      const current = queue.shift();
      for (const d of all) {
        if (d.parentId === current) {
          result.push(d.id);
          queue.push(d.id);
        }
      }
    }
    return result;
  }

  // Histórico de transferências de um departamento
  async getTransferHistory(id: number, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = { OR: [{ fromDepartmentId: id }, { toDepartmentId: id }] };

    const [data, total] = await Promise.all([
      this.prisma.read.departmentTransferLog.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, fullName: true } },
          fromDepartment: { select: { id: true, name: true, code: true } },
          toDepartment: { select: { id: true, name: true, code: true } },
        },
        orderBy: { transferredAt: 'desc' },
      }),
      this.prisma.read.departmentTransferLog.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // Relações de reporte (docs/modulo_departments.md Ponto 7 — "Hierarquia").
  // Distinto da Estrutura Organizacional (árvore de departamentos): aqui a
  // árvore é a de User.managerId — o único "quem reporta a quem" real no
  // schema (ver [[project_innova_leader_module_team_search]]).
  async getHierarchy(filters: HierarchyFilterDto) {
    const { page = 1, limit = 30, search, departmentId, positionId } = filters;
    const { skip, take } = calculatePagination(page, limit);

    let departmentIds: number[] | undefined;
    if (departmentId !== undefined) {
      const allDepts = await this.prisma.read.department.findMany({
        select: { id: true, parentId: true },
      });
      departmentIds = this.collectDescendantIds(allDepts, departmentId);
    }

    const where: Prisma.UserWhereInput = {
      ...(departmentIds ? { departmentId: { in: departmentIds } } : {}),
      ...(positionId !== undefined ? { positionId } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total, allUsers] = await Promise.all([
      this.prisma.read.user.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          fullName: true,
          avatarUrl: true,
          active: true,
          managerId: true,
          position: { select: { id: true, name: true } },
          department: {
            select: {
              id: true,
              name: true,
              parent: { select: { id: true, name: true } },
            },
          },
          manager: { select: { id: true, fullName: true } },
          _count: { select: { subordinates: true } },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prisma.read.user.count({ where }),
      // Mapa leve de toda a organização — necessário para calcular nível,
      // cadeia de reporte e subordinados indirectos sem N+1 queries.
      this.prisma.read.user.findMany({
        select: { id: true, fullName: true, managerId: true },
      }),
    ]);

    const byId = new Map(allUsers.map(u => [u.id, u]));
    const childrenMap = new Map<number, number[]>();
    for (const u of allUsers) {
      if (u.managerId != null) {
        const arr = childrenMap.get(u.managerId) ?? [];
        arr.push(u.id);
        childrenMap.set(u.managerId, arr);
      }
    }

    // Cadeia de reporte, do topo até ao próprio colaborador (inclusive) —
    // ex.: "Diretor de RH → Chefe de Formação → ... → Assistente".
    const buildChain = (userId: number): string[] => {
      const path: string[] = [];
      let current = byId.get(userId);
      const visited = new Set<number>();
      while (current) {
        path.unshift(current.fullName);
        if (current.managerId == null || visited.has(current.managerId)) break;
        visited.add(current.managerId);
        current = byId.get(current.managerId);
      }
      return path;
    };

    const levelOf = (userId: number): number => {
      let level = 0;
      let current = byId.get(userId);
      const visited = new Set<number>();
      while (current?.managerId != null && !visited.has(current.managerId)) {
        visited.add(current.managerId);
        level++;
        current = byId.get(current.managerId);
      }
      return level;
    };

    // Todos os descendentes (directos + indirectos) via BFS na árvore de managerId.
    const countDescendants = (userId: number): number => {
      let count = 0;
      const queue = [...(childrenMap.get(userId) ?? [])];
      const visited = new Set<number>();
      while (queue.length) {
        const next = queue.shift()!;
        if (visited.has(next)) continue;
        visited.add(next);
        count++;
        for (const c of childrenMap.get(next) ?? []) queue.push(c);
      }
      return count;
    };

    const data = rows.map(u => {
      const directReportsCount = u._count.subordinates;
      const totalDescendants = countDescendants(u.id);
      return {
        id: u.id,
        fullName: u.fullName,
        avatarUrl: u.avatarUrl,
        active: u.active,
        position: u.position,
        department: u.department
          ? {
              id: u.department.parent?.id ?? u.department.id,
              name: u.department.parent?.name ?? u.department.name,
            }
          : null,
        subdepartment: u.department?.parent ? u.department.name : null,
        manager: u.manager,
        level: levelOf(u.id),
        directReportsCount,
        indirectReportsCount: Math.max(totalDescendants - directReportsCount, 0),
        reportingChain: buildChain(u.id),
      };
    });

    return buildPaginatedResponse(data, total, page, limit);
  }

  // Rótulos dos eventos de histórico (docs/modulo_departments.md Ponto 8).
  private readonly HISTORY_ACTION_LABELS: Record<string, string> = {
    CREATE: 'Departamento criado',
    UPDATE: 'Dados do departamento alterados',
    DEACTIVATE: 'Departamento desactivado',
    ACTIVATE: 'Departamento reactivado',
    ARCHIVE: 'Departamento arquivado',
    DELETE: 'Departamento eliminado',
    CHILD_CREATED: 'Subdepartamento criado',
  };

  // Histórico unificado (docs/modulo_departments.md Ponto 8) — junta 3 fontes
  // reais (nenhum modelo DepartmentHistory existe no schema, nem é preciso
  // criar um): AuditLog (ciclo de vida do departamento, ver create/update/
  // deactivate/activate/archive/remove acima), DepartmentHeadHistory
  // (mudanças de responsável) e DepartmentTransferLog (colaboradores
  // transferidos). Cada fonte é limitada a `take` antes do merge — suficiente
  // para o volume esperado por departamento sem um UNION a nível de BD.
  async getHistory(filters: HistoryFilterDto) {
    const { page = 1, limit = 30, departmentId } = filters;
    const sourceLimit = 300;

    const [auditRows, headRows, transferRows, depts] = await Promise.all([
      this.prisma.read.auditLog.findMany({
        where: {
          entity: 'Department',
          ...(departmentId !== undefined ? { entityId: departmentId } : {}),
        },
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { timestamp: 'desc' },
        take: sourceLimit,
      }),
      this.prisma.read.departmentHeadHistory.findMany({
        where: departmentId !== undefined ? { departmentId } : {},
        include: {
          department: { select: { id: true, name: true, code: true } },
          head: { select: { id: true, fullName: true } },
          changedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { startedAt: 'desc' },
        take: sourceLimit,
      }),
      this.prisma.read.departmentTransferLog.findMany({
        where:
          departmentId !== undefined
            ? { OR: [{ fromDepartmentId: departmentId }, { toDepartmentId: departmentId }] }
            : {},
        include: {
          user: { select: { id: true, fullName: true } },
          fromDepartment: { select: { id: true, name: true, code: true } },
          toDepartment: { select: { id: true, name: true, code: true } },
        },
        orderBy: { transferredAt: 'desc' },
        take: sourceLimit,
      }),
      this.prisma.read.department.findMany({ select: { id: true, name: true, code: true } }),
    ]);

    const deptById = new Map(depts.map(d => [d.id, d]));

    interface HistoryEntry {
      id: string;
      date: string;
      type: string;
      department: { id: number; name: string; code: string } | null;
      field: string | null;
      before: unknown;
      after: unknown;
      changedBy: { id: number; fullName: string } | null;
      reason: string | null;
    }

    const entries: HistoryEntry[] = [];

    for (const a of auditRows) {
      let metadata: Record<string, unknown> = {};
      try {
        metadata = a.metadata ? JSON.parse(a.metadata) : {};
      } catch {
        metadata = {};
      }
      const dept = a.entityId != null ? (deptById.get(a.entityId) ?? null) : null;
      const fallbackDept =
        dept ??
        (typeof metadata.name === 'string'
          ? { id: a.entityId ?? 0, name: metadata.name, code: (metadata.code as string) ?? '' }
          : null);
      const type = this.HISTORY_ACTION_LABELS[a.action] ?? a.action;
      const changes = Array.isArray(metadata.changes)
        ? (metadata.changes as Array<{ field: string; before: unknown; after: unknown }>)
        : null;

      if (changes && changes.length) {
        for (const c of changes) {
          entries.push({
            id: `audit-${a.id}-${c.field}`,
            date: a.timestamp.toISOString(),
            type,
            department: fallbackDept,
            field: c.field,
            before: c.before,
            after: c.after,
            changedBy: a.user,
            reason: null,
          });
        }
      } else {
        entries.push({
          id: `audit-${a.id}`,
          date: a.timestamp.toISOString(),
          type,
          department: fallbackDept,
          field: typeof metadata.childName === 'string' ? 'Novo subdepartamento' : null,
          before: null,
          after: (metadata.childName as string) ?? null,
          changedBy: a.user,
          reason: (metadata.reason as string) ?? null,
        });
      }
    }

    // Agrupa por departamento e ordena por data para resolver o "responsável
    // anterior" de cada mudança (mesma lógica de getHeadHistory()).
    const headsByDept = new Map<number, typeof headRows>();
    for (const h of headRows) {
      const arr = headsByDept.get(h.departmentId) ?? [];
      arr.push(h);
      headsByDept.set(h.departmentId, arr);
    }
    for (const arr of headsByDept.values()) {
      arr.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    }
    for (const h of headRows) {
      const arr = headsByDept.get(h.departmentId) ?? [];
      const idx = arr.findIndex(x => x.id === h.id);
      const previous = idx > 0 ? arr[idx - 1] : null;
      entries.push({
        id: `head-${h.id}`,
        date: h.startedAt.toISOString(),
        type: 'Responsável alterado',
        department: h.department,
        field: 'Responsável',
        before: previous?.head.fullName ?? null,
        after: h.head.fullName,
        changedBy: h.changedBy,
        reason: h.reason,
      });
    }

    for (const t of transferRows) {
      entries.push({
        id: `transfer-${t.id}`,
        date: t.transferredAt.toISOString(),
        type: 'Colaborador transferido',
        department: t.toDepartment,
        field: t.user.fullName,
        before: t.fromDepartment?.name ?? null,
        after: t.toDepartment.name,
        changedBy: null,
        reason: t.reason,
      });
    }

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const total = entries.length;
    const start = (page - 1) * limit;
    const data = entries.slice(start, start + limit);

    return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  // Relatórios organizacionais (docs/modulo_departments.md Ponto 9). Cobre só
  // os relatórios suportados por dados já existentes no schema — Formação,
  // Avaliações, Competências, PDI, Férias e Custos exigem juntar dados de
  // outros módulos e ficam fora deste âmbito.
  async getReports(filters: ReportsFilterDto) {
    const { departmentId, unitId, location, active, from, to } = filters;

    let departmentIds: number[] | undefined;
    if (departmentId !== undefined) {
      const allDepts = await this.prisma.read.department.findMany({
        select: { id: true, parentId: true },
      });
      departmentIds = this.collectDescendantIds(allDepts, departmentId);
    }

    const deptWhere: Prisma.DepartmentWhereInput = {
      active: true,
      ...(departmentIds ? { id: { in: departmentIds } } : {}),
      ...(unitId !== undefined ? { unitId } : {}),
      ...(location ? { location: { contains: location, mode: 'insensitive' } } : {}),
    };

    const userWhere: Prisma.UserWhereInput = {
      ...(departmentIds
        ? { departmentId: { in: departmentIds } }
        : unitId !== undefined || location
          ? { department: deptWhere }
          : {}),
      ...(active !== undefined ? { active } : {}),
    };

    const [departments, positions, users] = await Promise.all([
      this.prisma.read.department.findMany({
        where: deptWhere,
        select: {
          id: true,
          name: true,
          code: true,
          expectedEmployees: true,
          maxEmployees: true,
          unit: { select: { id: true, name: true } },
          // Headcount = colaboradores activos (mesma base do limite aplicado em transferMember)
          _count: { select: { users: { where: { active: true } } } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.read.position.findMany({
        where: departmentIds ? { departmentId: { in: departmentIds } } : {},
        select: {
          id: true,
          name: true,
          headcountPlanned: true,
          department: { select: { id: true, name: true } },
          _count: { select: { users: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.read.user.findMany({
        where: userWhere,
        select: {
          active: true,
          hireDate: true,
          exitDate: true,
          contractType: true,
          department: { select: { location: true } },
        },
      }),
    ]);

    // Headcount por departamento / por unidade
    const headcountByDepartment = departments.map(d => ({
      id: d.id,
      name: d.name,
      code: d.code,
      actual: d._count.users,
      expected: d.expectedEmployees ?? null,
      max: d.maxEmployees ?? null,
    }));

    const unitMap = new Map<
      number,
      { id: number; name: string; actual: number; expected: number; max: number }
    >();
    for (const d of departments) {
      if (!d.unit) continue;
      const entry = unitMap.get(d.unit.id) ?? {
        id: d.unit.id,
        name: d.unit.name,
        actual: 0,
        expected: 0,
        max: 0,
      };
      entry.actual += d._count.users;
      entry.expected += d.expectedEmployees ?? 0;
      entry.max += d.maxEmployees ?? 0;
      unitMap.set(d.unit.id, entry);
    }
    const headcountByUnit = Array.from(unitMap.values());

    // Cargos ocupados vs. vagas
    const headcountByPosition = positions.map(p => ({
      id: p.id,
      name: p.name,
      department: p.department,
      planned: p.headcountPlanned ?? 0,
      occupied: p._count.users,
      vacancies: Math.max((p.headcountPlanned ?? 0) - p._count.users, 0),
    }));
    const positionsOccupiedVsVacant = headcountByPosition.reduce(
      (acc, p) => {
        acc.planned += p.planned;
        acc.occupied += p.occupied;
        acc.vacancies += p.vacancies;
        return acc;
      },
      { planned: 0, occupied: 0, vacancies: 0 },
    );

    // Distribuição de colaboradores
    const countBy = (key: (u: (typeof users)[number]) => string | null | undefined) => {
      const map = new Map<string, number>();
      for (const u of users) {
        const k = key(u) ?? 'Não informado';
        map.set(k, (map.get(k) ?? 0) + 1);
      }
      return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
    };
    const employeeDistribution = {
      total: users.length,
      active: users.filter(u => u.active).length,
      inactive: users.filter(u => !u.active).length,
      byLocation: countBy(u => u.department?.location),
      byContractType: countBy(u => u.contractType),
    };

    // Admissões / Saídas / Rotatividade / Antiguidade — período por omissão:
    // últimos 12 meses, se `from`/`to` não forem indicados.
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 365 * 24 * 3600 * 1000);

    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const admissionsByMonth = new Map<string, number>();
    const exitsByMonth = new Map<string, number>();
    let admissionsCount = 0;
    let exitsCount = 0;
    for (const u of users) {
      if (u.hireDate) {
        const hd = new Date(u.hireDate);
        if (hd >= fromDate && hd <= toDate) {
          admissionsCount++;
          const k = monthKey(hd);
          admissionsByMonth.set(k, (admissionsByMonth.get(k) ?? 0) + 1);
        }
      }
      if (u.exitDate) {
        const ed = new Date(u.exitDate);
        if (ed >= fromDate && ed <= toDate) {
          exitsCount++;
          const k = monthKey(ed);
          exitsByMonth.set(k, (exitsByMonth.get(k) ?? 0) + 1);
        }
      }
    }
    const currentHeadcount = users.filter(u => u.active).length;
    // Aproximação simples (saídas no período / efectivo actual) — não há
    // snapshots históricos de efectivo para um cálculo de média mais rigoroso.
    const turnoverRate = currentHeadcount > 0 ? (exitsCount / currentHeadcount) * 100 : 0;

    const now = Date.now();
    const seniorityYears = users
      .filter(u => u.active && u.hireDate)
      .map(u => (now - new Date(u.hireDate as Date).getTime()) / (365.25 * 24 * 3600 * 1000));
    const avgSeniorityYears =
      seniorityYears.length > 0
        ? seniorityYears.reduce((a, b) => a + b, 0) / seniorityYears.length
        : 0;
    const seniorityBuckets = [
      { label: '< 1 ano', min: 0, max: 1 },
      { label: '1-3 anos', min: 1, max: 3 },
      { label: '3-5 anos', min: 3, max: 5 },
      { label: '5-10 anos', min: 5, max: 10 },
      { label: '10+ anos', min: 10, max: Infinity },
    ].map(b => ({
      label: b.label,
      count: seniorityYears.filter(y => y >= b.min && y < b.max).length,
    }));

    return {
      period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      headcountByDepartment,
      headcountByUnit,
      headcountByPosition,
      positionsOccupiedVsVacant,
      employeeDistribution,
      admissions: {
        total: admissionsCount,
        byMonth: Array.from(admissionsByMonth.entries()).map(([month, count]) => ({
          month,
          count,
        })),
      },
      exits: {
        total: exitsCount,
        byMonth: Array.from(exitsByMonth.entries()).map(([month, count]) => ({ month, count })),
      },
      turnoverRate,
      seniority: {
        avgYears: avgSeniorityYears,
        buckets: seniorityBuckets,
      },
    };
  }
}

// ─── UNITS ────────────────────────────────────────────────────────────────────

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  // Unit.code é obrigatório e único no schema, mas CreateUnitDto nunca o expunha
  private async generateCode(): Promise<string> {
    const last = await this.prisma.unit.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('UNI-', ''), 10) + 1 : 1;
    return `UNI-${String(num).padStart(5, '0')}`;
  }

  async findAll() {
    return this.prisma.read.unit.findMany({
      include: {
        departments: { select: { id: true, name: true, code: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const u = await this.prisma.read.unit.findUnique({
      where: { id },
      include: {
        departments: { select: { id: true, name: true, code: true } },
        users: { select: { id: true, fullName: true, email: true, active: true } },
      },
    });
    if (!u) throw new NotFoundException('Unidade não encontrada');
    return u;
  }

  async create(dto: CreateUnitDto) {
    // Department é o lado proprietário da relação (Department.unitId), não o inverso
    const { departmentId, code: explicitCode, ...rest } = dto;

    let code: string;
    if (explicitCode) {
      code = explicitCode.toUpperCase();
      const exists = await this.prisma.unit.findFirst({
        where: { code: { equals: code, mode: 'insensitive' } },
      });
      if (exists) throw new ConflictException(`Código "${code}" já existe`);
    } else {
      code = await this.generateCode();
    }

    const unit = await this.prisma.unit.create({ data: { ...rest, code } });
    if (departmentId) {
      await this.prisma.department.update({
        where: { id: departmentId },
        data: { unitId: unit.id },
      });
    }
    return unit;
  }

  async update(id: number, dto: UpdateUnitDto) {
    await this.findOne(id);
    const { departmentId, code: explicitCode, ...rest } = dto;
    const data: Prisma.UnitUncheckedUpdateInput = { ...rest };
    if (explicitCode) {
      const code = explicitCode.toUpperCase();
      const clash = await this.prisma.unit.findFirst({
        where: { code: { equals: code, mode: 'insensitive' }, id: { not: id } },
      });
      if (clash) throw new ConflictException(`Código "${code}" já existe`);
      data.code = code;
    }
    const unit = await this.prisma.unit.update({ where: { id }, data });
    if (departmentId) {
      await this.prisma.department.update({ where: { id: departmentId }, data: { unitId: id } });
    }
    return unit;
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.unit.delete({ where: { id } });
  }
}

// ─── POSITIONS ────────────────────────────────────────────────────────────────

@Injectable()
export class PositionsService {
  constructor(private prisma: PrismaService) {}

  // Picker leve usado por outros módulos (ex.: wizard de aulas ao vivo,
  // formulário de formações) — devolve sempre um array simples. O catálogo
  // enriquecido do Ponto 6 (filtros/paginação/indicadores) vive em
  // DepartmentsService.getPositionsCatalog(), exposto em
  // GET /departments/positions, para não quebrar estes consumidores.
  async findAll() {
    return this.prisma.read.position.findMany({
      include: {
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // Detalhe de um cargo — "Ao abrir um cargo" (docs/modulo_departments.md
  // Ponto 6): descrição, responsabilidades, requisitos, competências,
  // formação/experiência necessárias, colaboradores, estrutura salarial, vagas.
  async findOne(id: number) {
    const p = await this.prisma.read.position.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        reportsTo: { select: { id: true, name: true } },
        subordinates: { select: { id: true, name: true } },
        users: { select: { id: true, fullName: true, email: true, active: true } },
        competencies: { include: { competency: { select: { id: true, name: true } } } },
        internalVacancies: {
          select: { id: true, title: true, status: true, slots: true, closingDate: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!p) throw new NotFoundException('Posição não encontrada');
    return {
      ...p,
      headcountOccupied: p.users.length,
      vacancies: Math.max((p.headcountPlanned ?? 0) - p.users.length, 0),
    };
  }

  async create(dto: CreatePositionDto) {
    // Sem posições com o mesmo nome (case-insensitive) no mesmo departamento
    const exists = await this.prisma.position.findFirst({
      where: {
        name: { equals: dto.name, mode: 'insensitive' },
        departmentId: dto.departmentId ?? undefined,
      },
    });
    if (exists) throw new ConflictException(`Posição "${dto.name}" já existe neste departamento`);

    // competencyIds não é coluna de Position — a associação real é via
    // PositionCompetency (que exige requiredLevel, não fornecido pelo DTO);
    // aceite mas não persistido, ver memória do módulo.
    const { competencyIds: _competencyIds, ...rest } = dto;
    return this.prisma.position.create({
      data: { ...rest, headcountPlanned: dto.headcountPlanned ?? 1 },
    });
  }

  async update(id: number, dto: UpdatePositionDto) {
    await this.findOne(id);
    const { competencyIds: _competencyIds, ...data } = dto;
    return this.prisma.position.update({ where: { id }, data });
  }

  async remove(id: number) {
    const pos = await this.prisma.read.position.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!pos) throw new NotFoundException('Posição não encontrada');
    if (pos._count.users > 0) {
      throw new BadRequestException(`Posição tem ${pos._count.users} colaboradores activos`);
    }
    await this.prisma.position.delete({ where: { id } });
    return { message: 'Posição eliminada' };
  }
}

// ─── CAREERS ──────────────────────────────────────────────────────────────────

@Injectable()
export class CareersService {
  constructor(private prisma: PrismaService) {}

  async findAllPositions() {
    return this.prisma.read.careerPosition.findMany({
      include: {
        competencies: { include: { competency: true } },
        _count: { select: { users: true } },
      },
      orderBy: { level: 'asc' },
    });
  }

  async findOnePosition(id: number) {
    const p = await this.prisma.careerPosition.findUnique({
      where: { id },
      include: {
        competencies: { include: { competency: true } },
        users: { include: { user: { select: { id: true, fullName: true } } } },
      },
    });
    if (!p) throw new NotFoundException('Posição de carreira não encontrada');
    return p;
  }

  async createPosition(dto: CreateCareerPositionDto) {
    const { competencies, ...data } = dto;
    const position = await this.prisma.careerPosition.create({ data });
    if (competencies?.length) {
      await this.prisma.positionCompetency.createMany({
        data: competencies.map(c => ({ positionId: position.id, ...c })),
      });
    }
    return this.findOnePosition(position.id);
  }

  async getUserCareerHistory(userId: number) {
    return this.prisma.read.userCareer.findMany({
      where: { userId },
      include: { position: true },
      orderBy: { startedAt: 'desc' },
    });
  }

  async assignCareerPosition(userId: number, positionId: number) {
    // Fechar posição atual
    await this.prisma.userCareer.updateMany({
      where: { userId, endedAt: null },
      data: { endedAt: new Date() },
    });
    return this.prisma.userCareer.create({
      data: { userId, positionId },
      include: { position: true },
    });
  }

  async getCareerLadder() {
    return this.prisma.read.careerPosition.findMany({
      include: {
        competencies: { include: { competency: true } },
        _count: { select: { users: true } },
      },
      orderBy: { level: 'asc' },
    });
  }
}
