import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOrgDepartmentDto, UpdateOrgDepartmentDto, DepartmentFilterDto,
  CreateOrgPositionDto, UpdateOrgPositionDto, PositionFilterDto,
  CreateOrgUnitDto, UpdateOrgUnitDto,
  RecordOrgChangeDto, OrgChartFilterDto,
  DepartmentStatus,
} from './organization.dto';

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(private prisma: PrismaService) {}

  // ─── ESTATÍSTICAS / DASHBOARD ─────────────────────────────────────────────

  async getStats() {
    const [units, departments, positions, totalStaff, managers, activePositions] = await Promise.all([
      this.prisma.unit.count(),
      this.prisma.department.count({ where: { status: 'ACTIVE' } }),
      this.prisma.position.count(),
      this.prisma.user.count({ where: { active: true } }),
      this.prisma.user.count({ where: { active: true, managerId: null, id: { gt: 0 } } }),
      this.prisma.position.findMany({
        select: { id: true, headcountPlanned: true, _count: { select: { users: true } } },
      }),
    ]);

    // Headcount: ocupado vs planeado
    const headcountOccupied = activePositions.reduce((s, p) => s + p._count.users, 0);
    const headcountPlanned  = activePositions.reduce((s, p) => s + (p.headcountPlanned ?? 0), 0);
    const openPositions     = Math.max(0, headcountPlanned - headcountOccupied);

    // Span of control (média de liderados por gestor)
    const managerIds = (await this.prisma.user.findMany({
      where:  { active: true, managerId: { not: null } },
      select: { managerId: true },
      distinct: ['managerId'],
    })).map(u => u.managerId!).filter(Boolean);

    const spanOfControl = managerIds.length > 0
      ? Math.round((totalStaff / managerIds.length) * 10) / 10
      : 0;

    // Profundidade hierárquica máxima
    const maxDepth = await this.calcMaxHierarchyDepth();

    // Distribuição por departamento
    const deptDist = await this.prisma.department.findMany({
      where:   { status: 'ACTIVE' },
      select:  { id: true, name: true, _count: { select: { users: true } } },
      orderBy: { users: { _count: 'desc' } },
      take:    10,
    });

    return {
      units,
      departments,
      positions,
      headcount: {
        total: totalStaff, occupied: headcountOccupied,
        planned: headcountPlanned, open: openPositions,
      },
      kpis: {
        spanOfControl,
        managerCount: managerIds.length,
        maxHierarchyDepth: maxDepth,
        managersOverloaded: await this.prisma.user.count({
          where: {
            active: true,
            subordinates: { some: {} },
            // gestores com >10 liderados directos
          },
        }),
      },
      topDepartments: deptDist,
    };
  }

  private async calcMaxHierarchyDepth(): Promise<number> {
    // Conta colaboradores sem gestor (raízes) e calcula profundidade
    const roots = await this.prisma.user.findMany({
      where:  { active: true, managerId: null },
      select: { id: true },
    });
    if (!roots.length) return 0;

    let maxDepth = 0;
    const visited = new Set<number>();

    const dfs = async (userId: number, depth: number) => {
      if (visited.has(userId) || depth > 15) return; // evitar loops
      visited.add(userId);
      maxDepth = Math.max(maxDepth, depth);

      const subs = await this.prisma.user.findMany({
        where:  { managerId: userId, active: true },
        select: { id: true },
        take:   20,
      });
      for (const s of subs) await dfs(s.id, depth + 1);
    };

    for (const r of roots.slice(0, 5)) await dfs(r.id, 1); // limita a 5 raízes
    return maxDepth;
  }

  // ─── ORGANOGRAMA ──────────────────────────────────────────────────────────

  async getOrgChart(filters: OrgChartFilterDto) {
    const { departmentId, rootUserId, depth = 3 } = filters;

    // Ponto de partida
    const rootWhere: any = { active: true };
    if (rootUserId)    rootWhere.id           = rootUserId;
    else if (!departmentId) rootWhere.managerId = null; // raízes da org
    else               rootWhere.departmentId  = departmentId;

    const roots = await this.prisma.user.findMany({
      where: rootWhere,
      select: this.orgChartSelect(),
      take:  departmentId ? 100 : 20,
    });

    // Expandir recursivamente até depth
    const tree = await Promise.all(roots.map(r => this.buildSubtree(r, depth, 1)));
    return tree;
  }

  private orgChartSelect() {
    return {
      id: true, fullName: true, email: true, avatarUrl: true, managerId: true,
      position:   { select: { id: true, name: true, level: true } },
      department: { select: { id: true, name: true, color: true } },
      _count:     { select: { subordinates: true } },
    };
  }

  private async buildSubtree(user: any, maxDepth: number, currentDepth: number): Promise<any> {
    const node: any = { ...user, children: [] };

    if (currentDepth < maxDepth) {
      const children = await this.prisma.user.findMany({
        where:  { managerId: user.id, active: true },
        select: this.orgChartSelect(),
      });
      node.children = await Promise.all(
        children.map(c => this.buildSubtree(c, maxDepth, currentDepth + 1))
      );
    }

    return node;
  }

  // ─── DEPARTAMENTOS ────────────────────────────────────────────────────────

  async getDepartments(filters: DepartmentFilterDto) {
    const { page = 1, limit = 30, search, status, parentId, unitId, rootOnly } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status)   where.status   = status;
    if (unitId)   where.unitId   = unitId;
    if (rootOnly) where.parentId = null;
    else if (parentId !== undefined) where.parentId = parentId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.department.findMany({
        where, skip, take: limit,
        include: {
          head:   { select: { id: true, fullName: true, avatarUrl: true } },
          parent: { select: { id: true, name: true } },
          unit:   { select: { id: true, name: true } },
          _count: { select: { users: true, children: true } },
        },
        orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.department.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getDepartmentDetails(id: number) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: {
        head:     { select: { id: true, fullName: true, avatarUrl: true, email: true } },
        parent:   { select: { id: true, name: true, code: true } },
        children: { select: { id: true, name: true, code: true, _count: { select: { users: true } } } },
        unit:     { select: { id: true, name: true, city: true } },
        users: {
          where:  { active: true },
          select: {
            id: true, fullName: true, email: true, avatarUrl: true, hireDate: true,
            position: { select: { id: true, name: true, level: true } },
          },
          orderBy: { fullName: 'asc' },
        },
        _count: { select: { users: true, children: true } },
      },
    });
    if (!dept) throw new NotFoundException('Departamento não encontrado');
    return dept;
  }

  async createDepartment(dto: CreateOrgDepartmentDto) {
    const exists = await this.prisma.department.findFirst({
      where: { code: { equals: dto.code, mode: 'insensitive' } },
    });
    if (exists) throw new ConflictException(`Código "${dto.code}" já existe`);

    if (dto.parentId) {
      const parent = await this.prisma.department.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Departamento pai não encontrado');
    }

    return this.prisma.department.create({
      data: {
        name:         dto.name,
        code:         dto.code.toUpperCase(),
        description:  dto.description,
        parentId:     dto.parentId,
        headId:       dto.headId,
        unitId:       dto.unitId,
        costCenter:   dto.costCenter,
        annualBudget: dto.annualBudget,
        status:       dto.status ?? 'ACTIVE',
        color:        dto.color,
      },
      include: { head: { select: { id: true, fullName: true } } },
    });
  }

  async updateDepartment(id: number, dto: UpdateOrgDepartmentDto) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept) throw new NotFoundException('Departamento não encontrado');

    // Verificar loop hierárquico
    if (dto.parentId && dto.parentId === id) {
      throw new BadRequestException('Departamento não pode ser pai de si próprio');
    }

    return this.prisma.department.update({ where: { id }, data: dto });
  }

  async deleteDepartment(id: number) {
    const dept = await this.prisma.department.findUnique({
      where:   { id },
      include: { _count: { select: { users: true, children: true } } },
    });
    if (!dept) throw new NotFoundException('Departamento não encontrado');
    if (dept._count.users > 0) {
      throw new BadRequestException(`Departamento tem ${dept._count.users} colaboradores. Transfira-os primeiro.`);
    }
    if (dept._count.children > 0) {
      throw new BadRequestException('Departamento tem sub-departamentos. Elimine-os primeiro.');
    }
    await this.prisma.department.delete({ where: { id } });
    return { message: 'Departamento eliminado' };
  }

  // ─── POSIÇÕES ─────────────────────────────────────────────────────────────

  async getPositions(filters: PositionFilterDto) {
    const { page = 1, limit = 30, search, level, departmentId } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (level)        where.level        = level;
    if (departmentId) where.departmentId = departmentId;
    if (search)       where.name         = { contains: search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      this.prisma.position.findMany({
        where, skip, take: limit,
        include: {
          _count: { select: { users: true } },
        },
        orderBy: [{ level: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.position.count({ where }),
    ]);

    return {
      data: data.map(p => ({
        ...p,
        headcountOccupied: p._count.users,
        headcountOpen:     Math.max(0, (p.headcountPlanned ?? 0) - p._count.users),
      })),
      total, page, limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createPosition(dto: CreateOrgPositionDto) {
    const exists = await this.prisma.position.findFirst({
      where: {
        name:          { equals: dto.name, mode: 'insensitive' },
        departmentId:  dto.departmentId ?? undefined,
      },
    });
    if (exists) throw new ConflictException(`Posição "${dto.name}" já existe neste departamento`);

    return this.prisma.position.create({
      data: {
        name:             dto.name,
        code:             dto.code,
        description:      dto.description,
        level:            dto.level,
        departmentId:     dto.departmentId,
        salaryMin:        dto.salaryMin,
        salaryMax:        dto.salaryMax,
        headcountPlanned: dto.headcountPlanned ?? 1,
      },
    });
  }

  async updatePosition(id: number, dto: UpdateOrgPositionDto) {
    const pos = await this.prisma.position.findUnique({ where: { id } });
    if (!pos) throw new NotFoundException('Posição não encontrada');
    return this.prisma.position.update({ where: { id }, data: dto });
  }

  async deletePosition(id: number) {
    const pos = await this.prisma.position.findUnique({
      where:   { id },
      include: { _count: { select: { users: true } } },
    });
    if (!pos) throw new NotFoundException('Posição não encontrada');
    if (pos._count.users > 0) {
      throw new BadRequestException(`Posição tem ${pos._count.users} colaboradores activos`);
    }
    await this.prisma.position.delete({ where: { id } });
    return { message: 'Posição eliminada' };
  }

  // ─── UNIDADES ─────────────────────────────────────────────────────────────

  async getUnits() {
    return this.prisma.unit.findMany({
      include: {
        _count: { select: { users: true, departments: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createUnit(dto: CreateOrgUnitDto) {
    const exists = await this.prisma.unit.findFirst({
      where: { code: { equals: dto.code, mode: 'insensitive' } },
    });
    if (exists) throw new ConflictException(`Código "${dto.code}" já existe`);

    return this.prisma.unit.create({
      data: { ...dto, code: dto.code.toUpperCase() },
    });
  }

  async updateUnit(id: number, dto: UpdateOrgUnitDto) {
    const unit = await this.prisma.unit.findUnique({ where: { id } });
    if (!unit) throw new NotFoundException('Unidade não encontrada');
    return this.prisma.unit.update({ where: { id }, data: dto });
  }

  // ─── AUDIT / HISTÓRICO DE MOVIMENTAÇÕES ──────────────────────────────────

  async recordOrgChange(dto: RecordOrgChangeDto, performedById: number) {
    const change = await this.prisma.orgChangeLog.create({
      data: {
        userId:           dto.userId,
        changeType:       dto.changeType,
        fromDepartmentId: dto.fromDepartmentId,
        toDepartmentId:   dto.toDepartmentId,
        fromPositionId:   dto.fromPositionId,
        toPositionId:     dto.toPositionId,
        fromManagerId:    dto.fromManagerId,
        toManagerId:      dto.toManagerId,
        effectiveDate:    new Date(dto.effectiveDate),
        reason:           dto.reason,
        notes:            dto.notes,
        performedById,
      },
      include: {
        user: { select: { id: true, fullName: true } },
      },
    });

    // Notificar utilizador
    await this.prisma.notificationLog.create({
      data: {
        userId:   dto.userId,
        type:     'ORG_CHANGE',
        message:  `Mudança organizacional registada: ${dto.changeType}`,
        metadata: JSON.stringify({}),
      },
    }).catch(() => {});

    return change;
  }

  async getUserOrgHistory(userId: number) {
    return this.prisma.orgChangeLog.findMany({
      where:   { userId },
      include: {
        fromDepartment: { select: { id: true, name: true } },
        toDepartment:   { select: { id: true, name: true } },
        fromPosition:   { select: { id: true, name: true } },
        toPosition:     { select: { id: true, name: true } },
        performedBy:    { select: { id: true, fullName: true } },
      },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  async getOrgTimeline(fromDate?: string, toDate?: string) {
    const where: any = {};
    if (fromDate) where.effectiveDate = { gte: new Date(fromDate) };
    if (toDate)   where.effectiveDate = { ...where.effectiveDate, lte: new Date(toDate) };

    return this.prisma.orgChangeLog.findMany({
      where,
      include: {
        user:           { select: { id: true, fullName: true, avatarUrl: true } },
        fromDepartment: { select: { id: true, name: true } },
        toDepartment:   { select: { id: true, name: true } },
        fromPosition:   { select: { id: true, name: true } },
        toPosition:     { select: { id: true, name: true } },
      },
      orderBy: { effectiveDate: 'desc' },
      take:    200,
    });
  }

  // ─── HEADCOUNT & KPIs ─────────────────────────────────────────────────────

  async getHeadcountByDepartment() {
    const depts = await this.prisma.department.findMany({
      where:   { status: 'ACTIVE' },
      select: {
        id: true, name: true, code: true, color: true,
        _count: { select: { users: true } },
      },
      orderBy: { users: { _count: 'desc' } },
    });

    const positions = await this.prisma.position.findMany({
      select: { departmentId: true, headcountPlanned: true, _count: { select: { users: true } } },
    });

    return depts.map(dept => {
      const deptPositions = positions.filter(p => p.departmentId === dept.id);
      const planned = deptPositions.reduce((s, p) => s + (p.headcountPlanned ?? 0), 0);
      const occupied = dept._count.users;
      return {
        ...dept,
        occupied,
        planned,
        open:        Math.max(0, planned - occupied),
        occupancyPct: planned > 0 ? Math.round((occupied / planned) * 100) : null,
      };
    });
  }

  async getSpanOfControlReport() {
    const managers = await this.prisma.user.findMany({
      where:  { active: true, subordinates: { some: {} } },
      select: {
        id: true, fullName: true, avatarUrl: true,
        position:    { select: { name: true, level: true } },
        department:  { select: { name: true } },
        _count:      { select: { subordinates: true } },
      },
      orderBy: { subordinates: { _count: 'desc' } },
    });

    const total      = managers.length;
    const overloaded = managers.filter(m => m._count.subordinates > 10).length;
    const optimal    = managers.filter(m => m._count.subordinates >= 4 && m._count.subordinates <= 8).length;

    return {
      managers,
      summary: {
        total,
        overloaded,
        optimal,
        underutilized: managers.filter(m => m._count.subordinates < 2).length,
        avgSpan: total > 0
          ? Math.round((managers.reduce((s, m) => s + m._count.subordinates, 0) / total) * 10) / 10
          : 0,
      },
    };
  }

  // ─── PERFIL ORGANIZACIONAL DO COLABORADOR ─────────────────────────────────

  async getUserOrgProfile(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, fullName: true, email: true, avatarUrl: true, hireDate: true, active: true,
        position:    { select: { id: true, name: true, level: true, salaryMin: true, salaryMax: true } },
        department:  { select: { id: true, name: true, code: true, head: { select: { id: true, fullName: true } } } },
        unit:        { select: { id: true, name: true, city: true, country: true } },
        manager:     { select: { id: true, fullName: true, avatarUrl: true, position: { select: { name: true } } } },
        subordinates:{ select: { id: true, fullName: true, avatarUrl: true, position: { select: { name: true } } }, where: { active: true } },
      },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');

    const history = await this.getUserOrgHistory(userId);

    return { ...user, orgHistory: history.slice(0, 5) };
  }
}
