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
  CreateCareerPositionDto,
} from './departments.dto';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────

@Injectable()
export class DepartmentsService {
  private readonly logger = new Logger(DepartmentsService.name);

  constructor(private prisma: PrismaService) {}

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

  async findAll(filters: DepartmentFilterDto) {
    const { page = 1, limit = 30, search, active, parentId, rootOnly } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.DepartmentWhereInput = {};
    if (active !== undefined) where.active = active;
    if (parentId !== undefined) where.parentId = parentId;
    if (rootOnly) where.parentId = null;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { head: { fullName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.read.department.findMany({
        where,
        skip,
        take,
        include: {
          head: { select: { id: true, fullName: true, email: true } },
          parent: { select: { id: true, name: true, code: true } },
          children: { select: { id: true, name: true, code: true, active: true } },
          _count: { select: { users: true, children: true } },
        },
        orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.read.department.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, limit);
  }

  // Árvore hierárquica completa (para org chart)
  async getTree() {
    const all = await this.prisma.read.department.findMany({
      where: { active: true },
      include: {
        head: { select: { id: true, fullName: true, email: true } },
        _count: { select: { users: true, children: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Construir árvore recursivamente
    type DepartmentNode = (typeof all)[number] & { children: DepartmentNode[] };
    const buildTree = (parentId: number | null): DepartmentNode[] =>
      all.filter(d => d.parentId === parentId).map(d => ({ ...d, children: buildTree(d.id) }));

    return buildTree(null);
  }

  async findOne(id: number) {
    const d = await this.prisma.read.department.findUnique({
      where: { id },
      include: {
        head: { select: { id: true, fullName: true, email: true, position: true } },
        parent: { select: { id: true, name: true, code: true } },
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

  async create(dto: CreateDepartmentDto) {
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
        description: dto.description,
        parentId: dto.parentId,
        headId: dto.headId,
        color: dto.color,
        icon: dto.icon,
        costCenter: dto.costCenter,
        trainingBudget: dto.trainingBudget,
        annualBudget: dto.annualBudget,
        unitId: dto.unitId,
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

    return dept;
  }

  async update(id: number, dto: UpdateDepartmentDto) {
    const existing = await this.findOne(id);

    // Validar código único (case-insensitive; persistido em UPPERCASE)
    const nextCode = dto.code ? dto.code.toUpperCase() : undefined;
    if (nextCode && nextCode !== existing.code) {
      const codeExists = await this.prisma.department.findFirst({
        where: { code: { equals: nextCode, mode: 'insensitive' }, id: { not: id } },
      });
      if (codeExists) throw new ConflictException(`Código ${nextCode} já em uso`);
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
        data: { departmentId: id, headId: dto.headId, startedAt: new Date() },
      });
    }

    // active é a fonte de verdade; se o DTO trouxer status, espelha-se em active
    const { status, code: _code, ...rest } = dto;
    const data: Prisma.DepartmentUncheckedUpdateInput = { ...rest };
    if (nextCode) data.code = nextCode;
    if (status !== undefined) {
      data.status = status;
      data.active = status === 'ACTIVE';
    }

    return this.prisma.department.update({
      where: { id },
      data,
      include: {
        head: { select: { id: true, fullName: true } },
        parent: { select: { id: true, name: true, code: true } },
        _count: { select: { users: true } },
      },
    });
  }

  // Soft deactivate — preserva histórico
  async deactivate(id: number) {
    const d = await this.findOne(id);
    const activeUsers = d._count.users;
    if (activeUsers > 0) {
      throw new BadRequestException(
        `Departamento tem ${activeUsers} colaboradores activos. Transfira-os primeiro.`,
      );
    }
    return this.prisma.department.update({
      where: { id },
      data: { active: false, status: 'INACTIVE' },
    });
  }

  async activate(id: number) {
    await this.findOne(id);
    return this.prisma.department.update({
      where: { id },
      data: { active: true, status: 'ACTIVE' },
    });
  }

  // Hard-delete guardado — alvo do DELETE /organization/departments/:id.
  // Só elimina departamentos sem colaboradores e sem sub-departamentos.
  async remove(id: number) {
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
    await this.prisma.department.delete({ where: { id } });
    return { message: 'Departamento eliminado' };
  }

  // Transferir membro entre departamentos
  async transferMember(dto: TransferMemberDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    const target = await this.prisma.department.findUnique({
      where: { id: dto.targetDepartmentId },
    });
    if (!target || !target.active)
      throw new NotFoundException('Departamento de destino não encontrado ou inactivo');

    const previousDeptId = user.departmentId;

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
    await this.findOne(id);

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
      transfers: { in: transfersIn, out: transfersOut },
      breadcrumb,
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

  async findAll() {
    return this.prisma.read.position.findMany({
      include: {
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const p = await this.prisma.read.position.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!p) throw new NotFoundException('Posição não encontrada');
    return p;
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
