import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  UserFilterDto,
  BulkActionDto,
  InviteUserDto,
  UserChangePasswordDto,
  AccountStatus,
} from './users.dto';

// Campos base a incluir em todas as queries (sem password)
const USER_SELECT_SAFE = {
  id: true,
  fullName: true,
  email: true,
  employeeNumber: true,
  phone: true,
  avatarUrl: true,
  language: true,
  timezone: true,
  country: true,
  city: true,
  gender: true,
  birthDate: true,
  active: true,
  accountStatus: true,
  hrStatus: true,
  hireDate: true,
  exitDate: true,
  createdAt: true,
  updatedAt: true,
  roleId: true,
  departmentId: true,
  positionId: true,
  unitId: true,
  managerId: true,
};

const USER_INCLUDE_BASIC = {
  role: { select: { id: true, name: true } },
  department: { select: { id: true, name: true, code: true } },
  position: { select: { id: true, name: true, level: true } },
  unit: { select: { id: true, name: true } },
  manager: { select: { id: true, fullName: true, email: true, avatarUrl: true } },
  profile: true,
  points: { select: { points: true } },
} as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private prisma: PrismaService) {}

  // ─── Sanitizar (remover password) ────────────────────────────────────────
  private sanitize(user: { password?: string | null }) {
    const { password, ...rest } = user;
    return rest;
  }

  // ─── LISTAGEM ─────────────────────────────────────────────────────────────

  async findAll(filters: UserFilterDto) {
    const {
      page = 1,
      limit = 20,
      search,
      departmentId,
      positionId,
      unitId,
      managerId,
      roleId,
      accountStatus,
      hrStatus,
      active,
    } = filters;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (active !== undefined) where.active = active;
    if (departmentId) where.departmentId = departmentId;
    if (positionId) where.positionId = positionId;
    if (unitId) where.unitId = unitId;
    if (managerId) where.managerId = managerId;
    if (roleId) where.roleId = roleId;
    if (accountStatus) where.accountStatus = accountStatus;
    if (hrStatus) where.hrStatus = hrStatus;

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeNumber: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prismaRead.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          ...USER_SELECT_SAFE,
          role: { select: { id: true, name: true } },
          department: { select: { id: true, name: true, code: true } },
          position: { select: { id: true, name: true } },
          manager: { select: { id: true, fullName: true, avatarUrl: true } },
          points: { select: { points: true } },
          _count: { select: { enrollments: true, badgeAwards: true } },
        },
        orderBy: { fullName: 'asc' },
      }),
      this.prismaRead.user.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── DETALHE ──────────────────────────────────────────────────────────────

  async findOne(id: number) {
    const user = await this.prismaRead.user.findUnique({
      where: { id },
      include: {
        ...USER_INCLUDE_BASIC,
        subordinates: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
            active: true,
            position: { select: { name: true } },
          },
          where: { active: true },
          take: 20,
        },
        enrollments: {
          include: {
            course: {
              select: { id: true, title: true, thumbnailUrl: true, category: true, status: true },
            },
          },
          orderBy: { enrolledAt: 'desc' },
          take: 10,
        },
        certificates: {
          include: { course: { select: { id: true, title: true } } },
          orderBy: { issuedAt: 'desc' },
          take: 5,
        },
        badgeAwards: {
          include: { badge: true },
          orderBy: { awardedAt: 'desc' },
          take: 10,
        },
        userCompetencies: {
          include: { competency: { select: { id: true, name: true, category: true } } },
          orderBy: { evaluatedAt: 'desc' },
        },
        _count: {
          select: {
            enrollments: true,
            certificates: true,
            badgeAwards: true,
            subordinates: true,
            userCompetencies: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Utilizador não encontrado');
    return user;
  }

  // ─── CRIAR ────────────────────────────────────────────────────────────────

  async create(dto: CreateUserDto) {
    // Guards de unicidade antes da escrita: força primary para não validar contra réplica atrasada.
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email já registado');

    if (dto.employeeNumber) {
      const empExists = await this.prisma.user.findFirst({
        where: { employeeNumber: dto.employeeNumber },
      });
      if (empExists)
        throw new ConflictException(`Número de funcionário ${dto.employeeNumber} já existe`);
    }

    const hashed = dto.password ? await bcrypt.hash(dto.password, 12) : null;

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        password: hashed,
        employeeNumber: dto.employeeNumber,
        phone: dto.phone,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        gender: dto.gender,
        language: dto.language ?? 'pt',
        timezone: dto.timezone ?? 'Africa/Luanda',
        country: dto.country,
        city: dto.city,
        departmentId: dto.departmentId,
        positionId: dto.positionId,
        unitId: dto.unitId,
        managerId: dto.managerId,
        roleId: dto.roleId,
        hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
        hrStatus: dto.hrStatus ?? 'ACTIVE',
        accountStatus: dto.accountStatus ?? 'PENDING',
        active: true,
      },
      include: USER_INCLUDE_BASIC,
    });

    // Inicializar pontos
    await this.prisma.userPoints.create({ data: { userId: user.id, points: 0 } });

    // Notificar
    await this.prisma.notificationLog
      .create({
        data: {
          userId: user.id,
          type: 'ACCOUNT_CREATED',
          message: `Bem-vindo à plataforma INNOVA, ${user.fullName}!`,
        },
      })
      .catch(() => {});

    // Registar auditoria
    await this.writeAuditLog(user.id, user.id, 'USER_CREATED', { email: user.email });

    return this.sanitize(user);
  }

  // ─── ACTUALIZAR ───────────────────────────────────────────────────────────

  async update(id: number, dto: UpdateUserDto, updatedById?: number) {
    const existing = await this.findOne(id);

    if (dto.email && dto.email !== (existing as any).email) {
      // Guards de unicidade antes da escrita: força primary.
      const emailExists = await this.prisma.user.findFirst({
        where: { email: dto.email, id: { not: id } },
      });
      if (emailExists) throw new ConflictException('Email já em uso');
    }

    if (dto.employeeNumber && dto.employeeNumber !== (existing as any).employeeNumber) {
      const empExists = await this.prisma.user.findFirst({
        where: { employeeNumber: dto.employeeNumber, id: { not: id } },
      });
      if (empExists) throw new ConflictException('Número de funcionário já em uso');
    }

    const data: any = { ...dto };
    if (dto.password) data.password = await bcrypt.hash(dto.password, 12);
    if (dto.birthDate) data.birthDate = new Date(dto.birthDate);
    if (dto.hireDate) data.hireDate = new Date(dto.hireDate);
    if (dto.exitDate) data.exitDate = new Date(dto.exitDate);

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: USER_INCLUDE_BASIC,
    });

    await this.writeAuditLog(id, updatedById ?? id, 'USER_UPDATED', { fields: Object.keys(dto) });

    return this.sanitize(user);
  }

  // ─── PERFIL ───────────────────────────────────────────────────────────────

  async upsertProfile(userId: number, dto: UpdateProfileDto) {
    return this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...dto, interests: dto.interests ?? [] },
      update: { ...dto, interests: dto.interests ?? undefined },
    });
  }

  // ─── ESTADO DA CONTA ──────────────────────────────────────────────────────

  async activate(id: number) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { active: true, accountStatus: 'ACTIVE' },
    });
    await this.writeAuditLog(id, id, 'USER_ACTIVATED');
    return this.sanitize(user);
  }

  async deactivate(id: number, reason?: string) {
    const user = (await this.findOne(id)) as any;
    if (user.accountStatus === 'INACTIVE') return user;

    const updated = await this.prisma.user.update({
      where: { id },
      data: { active: false, accountStatus: 'INACTIVE' },
    });
    await this.writeAuditLog(id, id, 'USER_DEACTIVATED', { reason });
    return this.sanitize(updated);
  }

  async suspend(id: number, reason: string) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { active: false, accountStatus: 'SUSPENDED' },
    });
    await this.writeAuditLog(id, id, 'USER_SUSPENDED', { reason });
    return this.sanitize(user);
  }

  // ─── SOFT DELETE ──────────────────────────────────────────────────────────

  async remove(id: number) {
    const user = (await this.findOne(id)) as any;

    // Soft delete — preservar histórico
    await this.prisma.user.update({
      where: { id },
      data: {
        active: false,
        accountStatus: 'INACTIVE',
        hrStatus: 'TERMINATED',
        email: `deleted_${id}_${user.email}`, // Liberar email
        exitDate: new Date(),
      },
    });

    await this.writeAuditLog(id, id, 'USER_SOFT_DELETED');
    return { message: 'Utilizador desactivado e marcado como saído (soft delete)' };
  }

  // ─── ALTERAR PASSWORD ─────────────────────────────────────────────────────

  async changePassword(userId: number, dto: UserChangePasswordDto) {
    // Validação de credenciais antes de escrita: força primary (dado sensível, sem réplica atrasada).
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();

    const valid = user.password && (await bcrypt.compare(dto.currentPassword, user.password));
    if (!valid) throw new ForbiddenException('Password actual incorrecta');

    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });

    await this.writeAuditLog(userId, userId, 'PASSWORD_CHANGED');
    return { message: 'Password alterada com sucesso' };
  }

  // ─── EQUIPA DO GESTOR ─────────────────────────────────────────────────────

  async getTeam(managerId: number) {
    const subordinates = await this.prismaRead.user.findMany({
      where: { managerId, active: true },
      select: {
        ...USER_SELECT_SAFE,
        position: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        _count: { select: { enrollments: true, certificates: true } },
      },
    });

    const stats = await Promise.all(
      subordinates.map(async s => {
        const [completed, inProgress, overdue] = await Promise.all([
          this.prismaRead.enrollment.count({ where: { userId: s.id, status: 'COMPLETED' } }),
          this.prismaRead.enrollment.count({ where: { userId: s.id, status: 'IN_PROGRESS' } }),
          this.prismaRead.enrollment.count({
            where: {
              userId: s.id,
              deadline: { lt: new Date() },
              status: { notIn: ['COMPLETED', 'EXPIRED'] },
            },
          }),
        ]);
        return { ...s, learningStats: { completed, inProgress, overdue } };
      }),
    );

    return { managerId, team: stats, total: stats.length };
  }

  // ─── ESTATÍSTICAS ─────────────────────────────────────────────────────────

  async getUserStats(id: number) {
    await this.findOne(id);

    const [
      totalEnrollments,
      completed,
      inProgress,
      points,
      badgesCount,
      competenciesCount,
      overdueCount,
      recentActivity,
    ] = await Promise.all([
      this.prismaRead.enrollment.count({ where: { userId: id } }),
      this.prismaRead.enrollment.count({ where: { userId: id, status: 'COMPLETED' } }),
      this.prismaRead.enrollment.count({ where: { userId: id, status: 'IN_PROGRESS' } }),
      this.prismaRead.userPoints.findUnique({ where: { userId: id } }),
      this.prismaRead.badgeAward.count({ where: { userId: id } }),
      this.prismaRead.userCompetency.count({ where: { userId: id } }),
      this.prismaRead.enrollment.count({
        where: {
          userId: id,
          deadline: { lt: new Date() },
          status: { notIn: ['COMPLETED', 'EXPIRED'] },
        },
      }),
      this.prismaRead.enrollment.findMany({
        where: { userId: id },
        orderBy: { enrolledAt: 'desc' },
        take: 3,
        include: { course: { select: { id: true, title: true, thumbnailUrl: true } } },
      }),
    ]);

    return {
      userId: id,
      enrollments: { total: totalEnrollments, completed, inProgress, overdue: overdueCount },
      completionRate: totalEnrollments > 0 ? Math.round((completed / totalEnrollments) * 100) : 0,
      gamification: { points: points?.points ?? 0, badges: badgesCount },
      competencies: competenciesCount,
      recentActivity,
    };
  }

  // ─── DIRETÓRIO INTERNO ────────────────────────────────────────────────────

  async getDirectory(search?: string, departmentId?: number) {
    const where: any = { active: true };
    if (departmentId) where.departmentId = departmentId;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { position: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return this.prismaRead.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        avatarUrl: true,
        city: true,
        country: true,
        position: { select: { name: true } },
        department: { select: { name: true } },
      },
      orderBy: { fullName: 'asc' },
      take: 100,
    });
  }

  // ─── BULK ACTIONS ─────────────────────────────────────────────────────────

  async bulkAction(dto: BulkActionDto) {
    const results = { success: 0, errors: [] as string[] };

    for (const userId of dto.userIds) {
      try {
        if (dto.action === 'activate') await this.activate(userId);
        if (dto.action === 'deactivate') await this.deactivate(userId);
        if (dto.action === 'suspend') await this.suspend(userId, 'Acção em massa');
        if (dto.action === 'assign_course' && dto.courseId) {
          await this.prisma.enrollment.upsert({
            where: { courseId_userId: { courseId: dto.courseId, userId } },
            create: { courseId: dto.courseId, userId, mandatory: true, status: 'NOT_STARTED' },
            update: {},
          });
        }
        results.success++;
      } catch (e: any) {
        results.errors.push(`User ${userId}: ${e.message}`);
        this.logger.warn(`Erro: ${e?.message}`);
      }
    }

    return { ...results, total: dto.userIds.length };
  }

  // ─── BULK IMPORT ──────────────────────────────────────────────────────────

  async bulkImport(users: CreateUserDto[]) {
    const results = {
      success: 0,
      errors: [] as Array<{ line: number; email: string; error: string }>,
      created: [] as number[],
    };

    for (let i = 0; i < users.length; i++) {
      try {
        const user = await this.create(users[i]);
        results.success++;
        results.created.push((user as any).id);
      } catch (e: any) {
        results.errors.push({ line: i + 1, email: users[i].email, error: e.message });
      }
    }

    return {
      success: results.success,
      errors: results.errors.length,
      total: users.length,
      details: { created: results.created, errors: results.errors },
    };
  }

  // ─── CONVIDAR UTILIZADOR ──────────────────────────────────────────────────

  async invite(dto: InviteUserDto) {
    // Guard de unicidade antes da escrita: força primary.
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email já registado');

    const tempPassword = Math.random().toString(36).slice(-10);
    const user = await this.create({
      ...dto,
      password: tempPassword,
      accountStatus: AccountStatus.PENDING,
    });

    await this.prisma.notificationLog
      .create({
        data: {
          userId: (user as any).id,
          type: 'INVITE_SENT',
          message: `Convite enviado para ${dto.email}`,
        },
      })
      .catch(() => {});

    return { message: 'Convite enviado', userId: (user as any).id };
  }

  // ─── AUDIT LOGS ───────────────────────────────────────────────────────────

  private async writeAuditLog(
    userId: number,
    performedById: number,
    action: string,
    meta?: object,
  ) {
    try {
      await this.prisma.userAuditLog.create({
        data: {
          userId,
          performedById,
          action,
          meta: meta ? JSON.stringify(meta) : null,
        },
      });
    } catch (e: any) {
      this.logger.warn(`Erro: ${e?.message}`);
    }
  }

  async getAuditLogs(userId: number, page = 1, limit = 30) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prismaRead.userAuditLog.findMany({
        where: { userId },
        skip,
        take: limit,
        include: { performedBy: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prismaRead.userAuditLog.count({ where: { userId } }),
    ]);
    return { data, total, page, limit };
  }

  // ─── DASHBOARD DO ADMIN ───────────────────────────────────────────────────

  async getAdminDashboard() {
    const [totalUsers, activeUsers, pendingUsers, suspendedUsers, byDepartment] = await Promise.all(
      [
        this.prismaRead.user.count(),
        this.prismaRead.user.count({ where: { active: true } }),
        this.prismaRead.user.count({ where: { accountStatus: 'PENDING' } }),
        this.prismaRead.user.count({ where: { accountStatus: 'SUSPENDED' } }),
        this.prismaRead.department.findMany({
          include: { _count: { select: { users: true } } },
          orderBy: { users: { _count: 'desc' } },
          take: 10,
        }),
      ],
    );

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        pending: pendingUsers,
        suspended: suspendedUsers,
      },
      byDepartment: byDepartment.map(d => ({
        id: d.id,
        name: d.name,
        count: (d._count as any).users,
      })),
    };
  }
}
