// ─── employees/employees.service.ts ──────────────────────────────────────────
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreateContractDto,
  CreateEmployeeAttendanceDto,
  CreateFeedback360Dto,
  CreateEmployeeCareerPlanDto,
  CreatePdiDto,
  UpdatePdiProgressDto,
  EmployeesCreateDocumentDto,
  CreateTimelineEventDto,
  CreateSelfServiceRequestDto,
  ReviewRequestDto,
  BulkAssignCourseDto,
  BulkUpdateStatusDto,
  EmployeeFilterDto,
  EmployeeStatus,
  TimelineEventType,
} from './employees.dto';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDate(d?: string | null): Date | undefined {
  return d ? new Date(d) : undefined;
}

function buildOrderBy(sortBy = 'name', sortOrder: 'asc' | 'desc' = 'asc') {
  const allowedFields = ['name', 'joinedAt', 'department', 'role', 'seniority', 'createdAt'];
  const field = allowedFields.includes(sortBy) ? sortBy : 'name';
  return { [field]: sortOrder };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): any {
    return (this.prisma as any).db ?? this.prisma;
  }

  // ══════════════════════════════════════════════════════════════════
  // CORE — LIST & DETAIL
  // ══════════════════════════════════════════════════════════════════

  async findAll(filters: EmployeeFilterDto) {
    const {
      page = 1,
      limit = 20,
      search,
      role,
      department,
      location,
      status,
      seniority,
      contractType,
      workMode,
      managerId,
      joinedFrom,
      joinedTo,
      pdiStatus,
      skillName,
      skillLevel,
      costCenter,
      sortBy,
      sortOrder,
    } = filters;

    const skip = (page - 1) * limit;

    const where: any = {};

    // Texto livre / busca semântica básica
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { matricula: { contains: search, mode: 'insensitive' } },
        { role: { contains: search, mode: 'insensitive' } },
        { jobTitle: { contains: search, mode: 'insensitive' } },
        { department: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) where.role = { contains: role, mode: 'insensitive' };
    if (department) where.department = { contains: department, mode: 'insensitive' };
    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (status) where.status = status;
    if (seniority) where.seniority = seniority;
    if (contractType) where.contractType = contractType;
    if (workMode) where.workMode = workMode;
    if (managerId) where.managerId = managerId;
    if (costCenter) where.costCenter = { contains: costCenter, mode: 'insensitive' };

    if (joinedFrom || joinedTo) {
      where.joinedAt = {};
      if (joinedFrom) where.joinedAt.gte = new Date(joinedFrom);
      if (joinedTo) where.joinedAt.lte = new Date(joinedTo);
    }

    // Filtro por skills
    if (skillName) {
      where.employeeSkills = {
        some: {
          skill: { name: { contains: skillName, mode: 'insensitive' } },
          ...(skillLevel ? { currentLevel: { gte: skillLevel } } : {}),
        },
      };
    }

    // Filtro por status de PDI
    if (pdiStatus) {
      where.pdis = { some: { status: pdiStatus } };
    }

    const [data, total] = await Promise.all([
      this.prismaRead.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: buildOrderBy(sortBy, sortOrder),
        include: {
          manager: { select: { id: true, name: true, avatarUrl: true } },
          _count: {
            select: {
              contracts: true,
              feedbacks: true,
              careerPlans: true,
              pdis: true,
              documents: true,
              employeeSkills: true,
            },
          },
        },
      }),
      this.prismaRead.employee.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    };
  }

  async findOne(id: number, requesterId?: number) {
    const employee = await this.prismaRead.employee.findUnique({
      where: { id },
      include: {
        manager: { select: { id: true, name: true, avatarUrl: true, role: true } },
        subordinates: { select: { id: true, name: true, avatarUrl: true, role: true } },
        contracts: { orderBy: { startDate: 'desc' } },
        evaluations: { orderBy: { evaluatedAt: 'desc' }, take: 10 },
        feedbacks: { orderBy: { evaluatedAt: 'desc' }, take: 10 },
        careerPlans: { orderBy: { createdAt: 'desc' } },
        pdis: {
          orderBy: { createdAt: 'desc' },
          include: { actions: true },
        },
        attendances: { orderBy: { date: 'desc' }, take: 30 },
        documents: { orderBy: { createdAt: 'desc' } },
        employeeSkills: {
          include: { skill: true } as any,
          orderBy: [{ skill: { type: 'asc' } }, { currentLevel: 'desc' }] as any,
        },
        timeline: {
          orderBy: { occurredAt: 'desc' },
          take: 50,
        },
        _count: {
          select: {
            contracts: true,
            feedbacks: true,
            careerPlans: true,
            pdis: true,
            documents: true,
            employeeSkills: true,
          },
        },
      },
    });

    if (!employee) throw new NotFoundException(`Colaborador #${id} não encontrado`);

    // Log de acesso ao perfil
    if (requesterId && requesterId !== id) {
      await this.audit.log({
        action: 'PROFILE_VIEWED',
        entityType: 'Employee',
        entityId: id,
        userId: requesterId,
      });
    }

    return employee;
  }

  // ══════════════════════════════════════════════════════════════════
  // CORE — CRUD
  // ══════════════════════════════════════════════════════════════════

  async create(dto: CreateEmployeeDto, createdById: number) {
    // Verificar email único
    const exists = await this.prisma.employee.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('E-mail já cadastrado');

    // Gerar matrícula se não fornecida
    const matricula = dto.matricula ?? (await this.generateMatricula());

    const employee = await this.prisma.employee.create({
      data: {
        ...dto,
        matricula,
        joinedAt: new Date(dto.joinedAt),
        birthDate: toDate(dto.birthDate),
        status: dto.status ?? EmployeeStatus.ACTIVE,
        address: dto.address ? (dto.address as any) : undefined,
        emergencyContact: dto.emergencyContact ? (dto.emergencyContact as any) : undefined,
      },
    });

    // Timeline: admissão
    await this.addTimelineEvent({
      employeeId: employee.id,
      type: TimelineEventType.HIRED,
      title: 'Admissão',
      description: `Contratado como ${dto.role} no departamento ${dto.department ?? '–'}`,
      isPublic: true,
      occurredAt: dto.joinedAt,
    });

    await this.audit.log({
      action: 'EMPLOYEE_CREATED',
      entityType: 'Employee',
      entityId: employee.id,
      userId: createdById,
      metadata: {},
    });

    return employee;
  }

  async update(id: number, dto: UpdateEmployeeDto, updatedById: number) {
    const current = await this.findOne(id);

    const data: any = { ...dto };
    if (dto.joinedAt) data.joinedAt = new Date(dto.joinedAt);
    if (dto.birthDate) data.birthDate = new Date(dto.birthDate);
    if (dto.address) data.address = dto.address;
    if (dto.emergencyContact) data.emergencyContact = dto.emergencyContact;

    const updated = await this.prisma.employee.update({ where: { id }, data });

    // Detectar promoção automática
    if (dto.role && dto.role !== current.role) {
      await this.addTimelineEvent({
        employeeId: id,
        type: TimelineEventType.PROMOTED,
        title: 'Mudança de Cargo',
        description: `De "${current.role}" para "${dto.role}"`,
        isPublic: true,
      });
    }

    await this.audit.log({
      action: 'EMPLOYEE_UPDATED',
      entityType: 'Employee',
      entityId: id,
      userId: updatedById,
      metadata: {},
    });

    return updated;
  }

  async remove(id: number, deletedById: number) {
    await this.findOne(id);

    await this.prisma.employee.update({
      where: { id },
      data: { status: EmployeeStatus.TERMINATED },
    });

    await this.audit.log({
      action: 'EMPLOYEE_TERMINATED',
      entityType: 'Employee',
      entityId: id,
      userId: deletedById,
    });

    return { message: 'Colaborador desligado com sucesso' };
  }

  // ══════════════════════════════════════════════════════════════════
  // STATS & KPIs
  // ══════════════════════════════════════════════════════════════════

  async getEmployeeStats(id: number) {
    await this.findOne(id);

    const [
      contracts,
      feedbacks,
      activeCareerPlans,
      attendances,
      activePdi,
      completedCourses,
      skills,
      badges,
    ] = await Promise.all([
      this.prismaRead.contract.count({ where: { employeeId: id } }),
      this.prismaRead.feedback360.aggregate({
        where: { employeeId: id },
        _avg: { score: true },
        _count: true,
      }),
      this.prismaRead.careerPlan.count({ where: { employeeId: id, status: 'ACTIVE' } }),
      this.prismaRead.attendance.aggregate({
        where: { employeeId: id },
        _sum: { hoursWorked: true },
        _avg: { hoursWorked: true },
        _count: true,
      }),
      this.prismaRead.legacyPdi.findFirst({
        where: { employeeId: id, status: 'ACTIVE' },
        select: { progressPercent: true, title: true },
      }),
      this.prismaRead.enrollment
        ?.count({
          where: { userId: id, completedAt: { not: null } },
        })
        .catch(() => 0),
      this.prismaRead.employeeSkill.count({ where: { employeeId: id } }),
      this.prismaRead.badgeAward.count({ where: { userId: id } }).catch(() => 0),
    ]);

    return {
      totalContracts: contracts,
      avgFeedbackScore: +(feedbacks._avg.score ?? 0).toFixed(2),
      totalFeedbacks: feedbacks._count,
      activeCareerPlans,
      totalHoursWorked: +(attendances._sum.hoursWorked ?? 0).toFixed(1),
      avgDailyHours: +(attendances._avg.hoursWorked ?? 0).toFixed(2),
      totalAttendanceDays: attendances._count,
      pdiProgress: activePdi?.progressPercent ?? 0,
      activePdiTitle: activePdi?.title ?? null,
      completedCourses,
      totalSkills: skills,
      totalBadges: badges,
    };
  }

  async getHeadcountStats() {
    const [total, byStatus, byDepartment, bySeniority, byContractType, byWorkMode, recentHires] =
      await Promise.all([
        this.prismaRead.employee.count({ where: { status: EmployeeStatus.ACTIVE } }),
        this.prismaRead.employee.groupBy({ by: ['status'], _count: true }),
        this.prismaRead.employee.groupBy({
          by: ['department'],
          _count: true,
          where: { status: 'ACTIVE' },
          orderBy: { _count: { department: 'desc' } },
        }),
        this.prismaRead.employee.groupBy({
          by: ['seniority'],
          _count: true,
          where: { status: 'ACTIVE' },
        }),
        this.prismaRead.employee.groupBy({
          by: ['contractType'],
          _count: true,
          where: { status: 'ACTIVE' },
        }),
        this.prismaRead.employee.groupBy({
          by: ['workMode'],
          _count: true,
          where: { status: 'ACTIVE' },
        }),
        this.prismaRead.employee.count({
          where: {
            status: 'ACTIVE',
            joinedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
        }),
      ]);

    return { total, byStatus, byDepartment, bySeniority, byContractType, byWorkMode, recentHires };
  }

  // ══════════════════════════════════════════════════════════════════
  // CONTRACTS
  // ══════════════════════════════════════════════════════════════════

  async createContract(dto: CreateContractDto) {
    await this.findOne(dto.employeeId);
    return this.prisma.contract.create({
      data: {
        ...dto,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
    });
  }

  async getContracts(employeeId: number) {
    await this.findOne(employeeId);
    return this.prismaRead.contract.findMany({
      where: { employeeId },
      orderBy: { startDate: 'desc' },
    });
  }

  async updateContractStatus(id: number, status: string) {
    return this.prisma.contract.update({ where: { id }, data: { status } });
  }

  // ══════════════════════════════════════════════════════════════════
  // ATTENDANCE
  // ══════════════════════════════════════════════════════════════════

  async logAttendance(dto: CreateEmployeeAttendanceDto) {
    // Verificar duplicidade
    const existing = await this.prisma.attendance.findFirst({
      where: { employeeId: dto.employeeId, date: new Date(dto.date) },
    });
    if (existing) throw new ConflictException('Presença já registada para esta data');

    return this.prisma.attendance.create({
      data: { ...dto, date: new Date(dto.date), status: dto.status as any },
    });
  }

  async getAttendance(employeeId: number, from?: string, to?: string) {
    const where: any = { employeeId };
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const records = await this.prismaRead.attendance.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    const totalHours = records.reduce((acc, r) => acc + (r.hoursWorked ?? 0), 0);
    const totalDays = records.length;
    const avgHours = totalDays ? +(totalHours / totalDays).toFixed(2) : 0;
    const presentDays = records.filter(r => r.status === 'PRESENT').length;
    const absentDays = records.filter(r => r.status === 'ABSENT').length;

    return { records, totalHours, avgHours, totalDays, presentDays, absentDays };
  }

  // ══════════════════════════════════════════════════════════════════
  // FEEDBACK 360
  // ══════════════════════════════════════════════════════════════════

  async addFeedback360(dto: CreateFeedback360Dto) {
    await this.findOne(dto.employeeId);
    const fb = await this.prisma.feedback360.create({
      data: { ...dto, evaluatedAt: new Date(dto.evaluatedAt) },
    });

    await this.addTimelineEvent({
      employeeId: dto.employeeId,
      type: TimelineEventType.EVALUATION,
      title: 'Avaliação 360°',
      description: `Score: ${dto.score}/10 – ${dto.cycle ?? 'ciclo atual'}`,
      isPublic: false,
      metadata: {},
    });

    return fb;
  }

  async getFeedback360(employeeId: number, cycle?: string) {
    const where: any = { employeeId };
    if (cycle) where.cycle = cycle;

    const feedbacks = await this.prismaRead.feedback360.findMany({
      where,
      orderBy: { evaluatedAt: 'desc' },
    });
    const avg = feedbacks.length
      ? +(feedbacks.reduce((a, f) => a + f.score, 0) / feedbacks.length).toFixed(2)
      : 0;

    const byCycle = feedbacks.reduce((acc: any, f: any) => {
      const key = f.cycle ?? 'sem-ciclo';
      if (!acc[key]) acc[key] = [];
      acc[key].push(f);
      return acc;
    }, {});

    return { feedbacks, averageScore: avg, total: feedbacks.length, byCycle };
  }

  // ══════════════════════════════════════════════════════════════════
  // CAREER PLANS
  // ══════════════════════════════════════════════════════════════════

  async createCareerPlan(dto: CreateEmployeeCareerPlanDto) {
    await this.findOne(dto.employeeId);
    return this.prisma.careerPlan.create({
      data: {
        ...dto,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: 'ACTIVE',
      },
    });
  }

  async getCareerPlans(employeeId: number) {
    await this.findOne(employeeId);
    return this.prismaRead.careerPlan.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateCareerPlanStatus(id: number, status: string) {
    return this.prisma.careerPlan.update({ where: { id }, data: { status } });
  }

  // ══════════════════════════════════════════════════════════════════
  // PDI
  // ══════════════════════════════════════════════════════════════════

  async createPdi(dto: CreatePdiDto, createdById: number) {
    await this.findOne(dto.employeeId);
    const { actions, ...rest } = dto;

    const pdi = await this.prisma.legacyPdi.create({
      data: {
        ...rest,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        status: 'ACTIVE',
        progressPercent: 0,
        actions: actions
          ? { create: actions.map(a => ({ ...a, deadline: new Date(a.deadline) })) }
          : undefined,
      },
      include: { actions: true },
    });

    await this.addTimelineEvent({
      employeeId: dto.employeeId,
      type: TimelineEventType.PDI,
      title: 'PDI Criado',
      description: dto.title,
      isPublic: true,
    });

    return pdi;
  }

  async updatePdiProgress(id: number, dto: UpdatePdiProgressDto) {
    const pdi = await this.prisma.legacyPdi.update({
      where: { id },
      data: {
        progressPercent: dto.progressPercent,
        status: dto.progressPercent === 100 ? 'COMPLETED' : undefined,
        notes: dto.notes,
      },
    });
    return pdi;
  }

  async getPdis(employeeId: number) {
    await this.findOne(employeeId);
    return this.prismaRead.legacyPdi.findMany({
      where: { employeeId },
      include: { actions: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // SKILLS / COMPETÊNCIAS
  // ══════════════════════════════════════════════════════════════════

  async getEmployeeSkills(employeeId: number) {
    await this.findOne(employeeId);
    const skills = await this.prismaRead.employeeSkill.findMany({
      where: { employeeId },
      include: { skill: true } as any,
      orderBy: [{ skill: { type: 'asc' } }, { currentLevel: 'desc' }] as any,
    });

    // Gap analysis
    const gapAnalysis = skills.map(s => ({
      ...s,
      gap:
        ((s as any).desiredLevel ?? (s as any).currentLevel ?? 0) - ((s as any).currentLevel ?? 0),
      gapLabel: this.getGapLabel(
        ((s as any).desiredLevel ?? (s as any).currentLevel ?? 0) - ((s as any).currentLevel ?? 0),
      ),
    }));

    const byType = skills.reduce((acc: any, s: any) => {
      const type = s.skill.type;
      if (!acc[type]) acc[type] = [];
      acc[type].push(s);
      return acc;
    }, {});

    return { skills: gapAnalysis, byType, total: skills.length };
  }

  async assignSkill(dto: any, assignedById: number) {
    const existing = await this.prisma.employeeSkill.findUnique({
      where: { employeeId_skillId: { employeeId: dto.employeeId, skillId: dto.skillId } } as any,
    });
    if (existing) {
      return this.prisma.employeeSkill.update({
        where: { employeeId_skillId: { employeeId: dto.employeeId, skillId: dto.skillId } } as any,
        data: dto,
        include: { skill: true },
      });
    }
    return this.prisma.employeeSkill.create({
      data: dto,
      include: { skill: true },
    });
  }

  async updateSkillLevel(employeeId: number, skillId: number, dto: any) {
    return this.prisma.employeeSkill.update({
      where: { employeeId_skillId: { employeeId, skillId } } as any,
      data: { ...dto, updatedAt: new Date() },
      include: { skill: true },
    });
  }

  async removeSkill(employeeId: number, skillId: number) {
    return this.prisma.employeeSkill.delete({
      where: { employeeId_skillId: { employeeId, skillId } } as any,
    });
  }

  private getGapLabel(gap: number): string {
    if (gap <= 0) return 'ACHIEVED';
    if (gap === 1) return 'MINOR_GAP';
    if (gap === 2) return 'MODERATE_GAP';
    return 'CRITICAL_GAP';
  }

  // ══════════════════════════════════════════════════════════════════
  // DOCUMENTS
  // ══════════════════════════════════════════════════════════════════

  async createDocument(dto: EmployeesCreateDocumentDto, uploadedById: number) {
    await this.findOne(dto.employeeId);
    const doc = await this.prisma.employeeDocument.create({
      data: {
        ...dto,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        uploadedById,
        status: 'ACTIVE',
      },
    });

    await this.addTimelineEvent({
      employeeId: dto.employeeId,
      type: TimelineEventType.DOCUMENT,
      title: 'Documento Adicionado',
      description: dto.name,
      isPublic: false,
    });

    return doc;
  }

  async getDocuments(employeeId: number) {
    await this.findOne(employeeId);
    const docs = await this.prismaRead.employeeDocument.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });

    // Verificar documentos expirados
    const now = new Date();
    const expiringSoon = docs.filter(
      d =>
        d.expiresAt &&
        d.expiresAt > now &&
        d.expiresAt < new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    );
    const expired = docs.filter(d => d.expiresAt && d.expiresAt < now);

    return { documents: docs, expiringSoon, expired };
  }

  async deleteDocument(id: number, deletedById: number) {
    const doc = await this.prisma.employeeDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Documento não encontrado');

    await this.prisma.employeeDocument.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: new Date(), deletedById },
    });

    return { message: 'Documento removido' };
  }

  // ══════════════════════════════════════════════════════════════════
  // TIMELINE
  // ══════════════════════════════════════════════════════════════════

  async addTimelineEvent(dto: Partial<CreateTimelineEventDto> & { employeeId: number }) {
    return this.prisma.employeeTimeline.create({
      data: {
        employeeId: dto.employeeId,
        type: dto.type ?? TimelineEventType.NOTE,
        title: dto.title ?? '',
        description: dto.description,
        metadata: dto.metadata ? (dto.metadata as any) : undefined,
        isPublic: dto.isPublic ?? true,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      },
    });
  }

  async getTimeline(employeeId: number, type?: string, limit = 50) {
    await this.findOne(employeeId);
    const where: any = { employeeId };
    if (type) where.type = type;

    return this.prismaRead.employeeTimeline.findMany({
      where,
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // SELF-SERVICE REQUESTS
  // ══════════════════════════════════════════════════════════════════

  async createRequest(dto: CreateSelfServiceRequestDto) {
    await this.findOne(dto.employeeId);
    return this.prisma.selfServiceRequest.create({
      data: {
        ...dto,
        status: 'PENDING',
        payload: dto.payload ? (dto.payload as any) : undefined,
        attachments: dto.attachments ?? [],
      },
    });
  }

  async getRequests(employeeId: number, status?: string) {
    const where: any = { employeeId };
    if (status) where.status = status;
    return this.prismaRead.selfServiceRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewRequest(requestId: number, dto: ReviewRequestDto) {
    const req = await this.prisma.selfServiceRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Solicitação não encontrada');
    if (req.status !== 'PENDING') throw new BadRequestException('Solicitação já processada');

    const updated = await this.prisma.selfServiceRequest.update({
      where: { id: requestId },
      data: {
        status: dto.status,
        reviewNotes: dto.reviewNotes,
        reviewedById: dto.reviewerId,
        reviewedAt: new Date(),
      },
    });

    // Aplicar mudança automaticamente se aprovada
    if (dto.status === 'APPROVED' && req.type === 'DATA_CHANGE' && req.payload) {
      const payload = req.payload as any;
      await this.prisma.employee.update({
        where: { id: req.employeeId },
        data: payload,
      });
    }

    return updated;
  }

  // ══════════════════════════════════════════════════════════════════
  // ORGANOGRAMA
  // ══════════════════════════════════════════════════════════════════

  async getOrgChart(rootId?: number) {
    const where: any = { status: EmployeeStatus.ACTIVE };
    if (rootId) where.managerId = rootId;
    else where.managerId = null;

    const root = await this.prismaRead.employee.findMany({
      where,
      select: {
        id: true,
        name: true,
        role: true,
        jobTitle: true,
        department: true,
        avatarUrl: true,
        managerId: true,
        _count: { select: { subordinates: true } },
      },
    });

    return this.buildTree(root);
  }

  private async buildTree(nodes: any[]): Promise<any[]> {
    return Promise.all(
      nodes.map(async node => {
        const children = await this.prismaRead.employee.findMany({
          where: { managerId: node.id, status: EmployeeStatus.ACTIVE },
          select: {
            id: true,
            name: true,
            role: true,
            jobTitle: true,
            department: true,
            avatarUrl: true,
            managerId: true,
            _count: { select: { subordinates: true } },
          },
        });
        return {
          ...node,
          children: children.length > 0 ? await this.buildTree(children) : [],
        };
      }),
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // BULK ACTIONS
  // ══════════════════════════════════════════════════════════════════

  async bulkAssignCourses(dto: BulkAssignCourseDto, assignedById: number) {
    const results = await Promise.allSettled(
      dto.employeeIds.flatMap(empId =>
        dto.courseIds.map(courseId =>
          this.prisma.enrollment
            ?.create?.({
              data: { userId: empId, courseId, enrolledAt: new Date() },
            })
            .catch(() => null),
        ),
      ),
    );
    const success = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    return { success, failed, total: results.length };
  }

  async bulkUpdateStatus(dto: BulkUpdateStatusDto, updatedById: number) {
    const result = await this.prisma.employee.updateMany({
      where: { id: { in: dto.employeeIds } },
      data: { status: dto.status },
    });

    await this.audit.log({
      action: 'BULK_STATUS_UPDATE',
      entityType: 'Employee',
      entityId: 0,
      userId: updatedById,
      metadata: {},
    });

    return { updated: result.count };
  }

  async exportEmployees(filters: EmployeeFilterDto): Promise<any[]> {
    const { data } = await this.findAll({ ...filters, limit: 10000, page: 1 });
    return data.map((e: any) => ({
      matricula: e.matricula,
      name: e.name,
      email: e.email,
      role: e.role,
      department: e.department,
      seniority: e.seniority,
      status: e.status,
      joinedAt: e.joinedAt?.toISOString().split('T')[0],
      contractType: e.contractType,
      workMode: e.workMode,
      location: e.location,
      manager: e.manager?.fullName ?? '',
    }));
  }

  // ══════════════════════════════════════════════════════════════════
  // AUDIT LOG
  // ══════════════════════════════════════════════════════════════════

  async getAuditLog(employeeId: number, limit = 50) {
    return this.prismaRead.auditLog.findMany({
      where: { entity: 'Employee', entityId: employeeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // INTERNAL HELPERS
  // ══════════════════════════════════════════════════════════════════

  private async generateMatricula(): Promise<string> {
    const year = new Date().getFullYear().toString().slice(-2);
    const last = await this.prisma.employee.findFirst({
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const seq = String((last?.id ?? 0) + 1).padStart(5, '0');
    return `INN${year}${seq}`;
  }
}
