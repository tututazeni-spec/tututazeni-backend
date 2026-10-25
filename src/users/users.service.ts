import { avatarRef, avatarVersion, isDataUrl, parseAvatarDataUrl } from './avatar-ref';
import { runAsSystem } from '../common/rls/rls-context';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SecuritySettingsService } from '../settings/security-settings.service';
import { SessionRevocationService } from '../auth/session-revocation.service';
import { hashPassword, verifyPassword } from '../common/security/password-hasher';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { flattenRolePermissions } from '../common/utils/role-permissions';
import {
  checkEmailAgainstPolicy,
  EmailPolicyConfig,
  suggestEmail,
  suggestEmailAlternatives,
} from '../common/helpers/email-policy';
import {
  CreateUserDto,
  UpdateUserDto,
  UpdateProfileDto,
  UserFilterDto,
  BulkActionDto,
  InviteUserDto,
  UserChangePasswordDto,
  AccountStatus,
  ImportUsersDto,
  ModuleAuditLogFilterDto,
} from './users.dto';

const PASSWORD_BY_ADMIN_MESSAGE =
  'A senha não pode ser definida por um administrador — o utilizador define-a pelo link de convite ou de recuperação';

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

  constructor(
    private prisma: PrismaService,
    @InjectQueue('email') private readonly emailQueue: Queue,
    // Política de utilizadores (Definições §3). Optional: specs que montam o
    // serviço sem o SettingsModule continuam a funcionar (sem política).
    @Optional() private readonly settings?: SettingsService,
    // Definições §4: política de palavras-passe (comprimento, símbolo).
    @Optional() private readonly security?: SecuritySettingsService,
    // Revogação imediata de sessões (logout forçado, papel alterado).
    @Optional() private readonly revocation?: SessionRevocationService,
  ) {}

  // ─── Sanitizar (remover password) ────────────────────────────────────────
  // FIX: era `sanitize(user: { password?: string | null })` (não genérico) —
  // o retorno ficava amarrado a esse tipo mínimo declarado, não à forma real
  // do argumento passado em cada chamada, obrigando todos os chamadores a
  // fazer `(user as any).id`/`.email`/etc. depois de chamar sanitize().
  // Genérico preserva o shape real do argumento menos `password`.
  private sanitize<T extends { password?: string | null }>(user: T): Omit<T, 'password'> {
    const { password, ...rest } = user;
    return rest;
  }

  // ─── FORMATO DE EMAIL DO TENANT ───────────────────────────────────────────
  // docs/innova-formato-email-carrinho-sa.md. Sem emailDomain no tenant não há restrições.

  /**
   * ENFORCE: lança 400 com as violações. SUGGEST: devolve-as como avisos.
   * `config` permite à importação em massa ler a configuração uma só vez.
   */
  private async applyEmailPolicy(email: string, config?: EmailPolicyConfig): Promise<string[]> {
    const policy = config ?? (await this.settings?.getEmailPolicy());
    if (!policy?.emailDomain) return [];
    const violations = checkEmailAgainstPolicy(email, policy);
    if (violations.length > 0 && policy.emailPolicyMode === 'ENFORCE') {
      throw new BadRequestException(violations);
    }
    return violations;
  }

  /** Mensagem de email duplicado, com alternativas quando o tenant tem formato definido. */
  private async duplicateEmailMessage(email: string, fullName?: string): Promise<string> {
    const base = 'Email já registado';
    const policy = await this.settings?.getEmailPolicy();
    if (!policy?.emailDomain || !fullName) return base;
    const alternatives = await this.findFreeEmailAlternatives(fullName, policy.emailDomain);
    return alternatives.length > 0
      ? `${base}. Alternativas livres: ${alternatives.join(', ')}`
      : base;
  }

  private async findFreeEmailAlternatives(fullName: string, domain: string): Promise<string[]> {
    const candidates = suggestEmailAlternatives(fullName, domain, new Set(), 12);
    if (candidates.length === 0) return [];
    const taken = await this.prisma.user.findMany({
      where: { email: { in: candidates } },
      select: { email: true },
    });
    const takenSet = new Set(taken.map(u => u.email));
    return candidates.filter(c => !takenSet.has(c)).slice(0, 4);
  }

  /** Pré-validação para o formulário do Diretório (sugestão, estado e homónimos). */
  async checkEmail(fullName: string, email?: string) {
    const policy = await this.settings?.getEmailPolicy();
    if (!policy?.emailDomain) {
      return {
        enforced: false,
        domain: null,
        mode: null,
        suggestion: null,
        violations: [] as string[],
        taken: false,
        alternatives: [] as string[],
      };
    }
    const suggestion = suggestEmail(fullName, policy.emailDomain);
    const candidate = (email ?? suggestion ?? '').trim();
    const taken = candidate
      ? (await this.prisma.user.findUnique({
          where: { email: candidate },
          select: { id: true },
        })) !== null
      : false;
    return {
      enforced: true,
      domain: policy.emailDomain,
      mode: policy.emailPolicyMode,
      suggestion,
      violations: candidate ? checkEmailAgainstPolicy(candidate, policy) : [],
      taken,
      alternatives: taken ? await this.findFreeEmailAlternatives(fullName, policy.emailDomain) : [],
    };
  }

  // ─── LISTAGEM ─────────────────────────────────────────────────────────────

  async findAll(filters: UserFilterDto, actor?: { roleId: number | null; roleName?: string }) {
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
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.UserWhereInput = {};

    if (active !== undefined) where.active = active;
    // Âmbito por departamento do perfil (Definições §2). ADMIN/RH nunca são limitados.
    const privileged = actor?.roleName === 'ADMIN' || actor?.roleName === 'RH';
    const scope =
      this.settings && actor && !privileged
        ? await this.settings.getScopeForRole(actor.roleId)
        : null;
    if (scope) {
      if (departmentId && !scope.includes(departmentId)) {
        throw new ForbiddenException('Sem acesso a este departamento');
      }
      where.departmentId = departmentId ? departmentId : { in: scope };
    } else if (departmentId) {
      where.departmentId = departmentId;
    }
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
      this.prisma.read.user.findMany({
        where,
        skip,
        take,
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
      this.prisma.read.user.count({ where }),
    ]);

    const rows = data.map(u => ({
      ...u,
      avatarUrl: avatarRef(u.id, u.avatarUrl),
      manager: u.manager && {
        ...u.manager,
        avatarUrl: avatarRef(u.manager.id, u.manager.avatarUrl),
      },
    }));
    return buildPaginatedResponse(rows, total, page, limit);
  }

  /** Imagem do avatar para GET /users/:id/avatar; null se não houver ou não for raster. */
  async getAvatarImage(id: number) {
    const user = await this.prisma.read.user.findUnique({
      where: { id },
      select: { avatarUrl: true },
    });
    if (!user?.avatarUrl || !isDataUrl(user.avatarUrl)) return null;
    const parsed = parseAvatarDataUrl(user.avatarUrl);
    return parsed && { ...parsed, version: avatarVersion(user.avatarUrl) };
  }

  // ─── DETALHE ──────────────────────────────────────────────────────────────

  async findOne(id: number) {
    const user = await this.prisma.read.user.findUnique({
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
    if (!user) throw new NotFoundException(`Utilizador #${id} não encontrado`);
    return user;
  }

  // ─── LOOKUPS (formulário "Novo Utilizador") ───────────────────────────────

  // Não existe endpoint de catálogo para LearningPath fora deste módulo (ver
  // docs/modulo_users.md Ponto 2, "Percursos atribuídos") — findMany directo
  // só com o essencial para o picker.
  async getLearningPathLookups() {
    return this.prisma.learningPath.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    });
  }

  // ─── CRIAR ────────────────────────────────────────────────────────────────

  async create(
    dto: CreateUserDto,
    createdById?: number,
    opts: { skipPolicy?: boolean; actorRole?: string } = {},
  ) {
    await this.assertCanAssignRole(dto.roleId, opts.actorRole);
    if (this.settings && !opts.skipPolicy) dto = await this.settings.applyUserPolicy(dto);

    // Guards de unicidade antes da escrita: força primary para não validar contra réplica atrasada.
    const emailWarnings = await this.applyEmailPolicy(dto.email);
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException(await this.duplicateEmailMessage(dto.email, dto.fullName));
    }

    if (dto.employeeNumber) {
      const empExists = await this.prisma.user.findFirst({
        where: { employeeNumber: dto.employeeNumber },
      });
      if (empExists)
        throw new ConflictException(`Número de funcionário ${dto.employeeNumber} já existe`);
    }

    if (dto.username) {
      const usernameExists = await this.prisma.user.findFirst({
        where: { username: dto.username },
      });
      if (usernameExists) throw new ConflictException(`Username ${dto.username} já existe`);
    }

    // Zero-knowledge: nenhum administrador define ou conhece a senha de outro utilizador.
    // A conta nasce sem senha e o próprio utilizador define-a pelo link de convite.
    if (dto.password) throw new BadRequestException(PASSWORD_BY_ADMIN_MESSAGE);
    const hashed: string | null = null;

    let user: Prisma.UserGetPayload<{ include: typeof USER_INCLUDE_BASIC }>;
    try {
      user = await this.prisma.$transaction(async tx => {
        const created = await tx.user.create({
          data: {
            fullName: dto.fullName,
            email: dto.email,
            password: hashed,
            // Nunca gravar "" num campo `@unique` — colidiria no 2.º utilizador
            // sem nº de funcionário (P2002 -> 500). O DTO já normaliza "" -> undefined;
            // este `|| null` protege chamadores directos do serviço.
            employeeNumber: dto.employeeNumber || null,
            username: dto.username || null,
            phone: dto.phone,
            birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
            gender: dto.gender,
            language: dto.language ?? 'pt',
            timezone: dto.timezone ?? 'Africa/Luanda',
            country: dto.country,
            city: dto.city,
            preferredName: dto.preferredName,
            nationality: dto.nationality,
            identificationNumber: dto.identificationNumber,
            nif: dto.nif,
            personalEmail: dto.personalEmail,
            alternatePhone: dto.alternatePhone,
            address: dto.address,
            emergencyContactName: dto.emergencyContactName,
            emergencyContactPhone: dto.emergencyContactPhone,
            departmentId: dto.departmentId,
            positionId: dto.positionId,
            unitId: dto.unitId,
            managerId: dto.managerId,
            roleId: dto.roleId,
            hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
            hrStatus: dto.hrStatus ?? 'ACTIVE',
            accountStatus: dto.accountStatus ?? 'PENDING',
            companyName: dto.companyName,
            area: dto.area,
            jobFunction: dto.jobFunction,
            professionalCategory: dto.professionalCategory,
            workLocation: dto.workLocation,
            contractType: dto.contractType,
            workMode: dto.workMode,
            costCenter: dto.costCenter,
            workSchedule: dto.workSchedule,
            systemFunction: dto.systemFunction,
            mfaEnabled: dto.mfaEnabled ?? false,
            contentAccessLevel: dto.contentAccessLevel,
            isInstructor: dto.isInstructor ?? false,
            active: true,
            // Nested create (não uma 2.ª chamada depois): USER_INCLUDE_BASIC
            // já pede `profile` neste mesmo create — uma criação em separado
            // deixaria o `include` desta chamada ver o Profile como
            // inexistente e devolver `profile: null` ao próprio criador.
            ...(dto.interests?.length || dto.learningProfile
              ? {
                  profile: {
                    create: {
                      interests: dto.interests ?? [],
                      learningProfile: dto.learningProfile,
                    },
                  },
                }
              : {}),
          },
          include: USER_INCLUDE_BASIC,
        });

        if (dto.courseIds?.length) {
          await tx.enrollment.createMany({
            data: dto.courseIds.map(courseId => ({
              userId: created.id,
              courseId,
              origin: 'MANUAL' as const,
              assignedById: createdById,
            })),
            skipDuplicates: true,
          });
        }

        if (dto.learningPathIds?.length) {
          await tx.learningPathEnrollment.createMany({
            data: dto.learningPathIds.map(learningPathId => ({
              userId: created.id,
              learningPathId,
            })),
            skipDuplicates: true,
          });
        }

        if (dto.competencyIds?.length) {
          await tx.userCompetency.createMany({
            data: dto.competencyIds.map(competencyId => ({
              userId: created.id,
              competencyId,
              source: 'MANUAL' as const,
            })),
            skipDuplicates: true,
          });
        }

        if (dto.additionalPermissionIds?.length) {
          await tx.userPermission.createMany({
            data: dto.additionalPermissionIds.map(permissionId => ({
              userId: created.id,
              permissionId,
            })),
            skipDuplicates: true,
          });
        }

        return created;
      });
    } catch (e: unknown) {
      // P2003 = FK inválida (curso/percurso/competência/permissão inexistente).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2003') {
        throw new ConflictException(
          'Um dos IDs indicados (curso, percurso, competência ou permissão) não existe',
        );
      }
      throw e;
    }

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
      .catch((e: unknown) => {
        this.logger.warn({
          userId: user.id,
          action: 'USER_CREATED',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao registar notificação de criação de conta',
        });
      });

    // Registar auditoria
    await this.writeAuditLog(user.id, createdById ?? user.id, 'USER_CREATED', {
      email: user.email,
    });

    const sanitized = this.sanitize(user);
    return emailWarnings.length > 0 ? { ...sanitized, emailWarnings } : sanitized;
  }

  // ─── ACTUALIZAR ───────────────────────────────────────────────────────────

  async update(id: number, dto: UpdateUserDto, updatedById?: number, actorRole?: string) {
    const existing = await this.findOne(id);
    if (dto.roleId !== undefined && dto.roleId !== existing.roleId) {
      await this.assertCanAssignRole(dto.roleId, actorRole, id === updatedById);
    }

    let emailWarnings: string[] = [];
    if (dto.email && dto.email !== existing.email) {
      emailWarnings = await this.applyEmailPolicy(dto.email);
      // Guards de unicidade antes da escrita: força primary.
      const emailExists = await this.prisma.user.findFirst({
        where: { email: dto.email, id: { not: id } },
      });
      if (emailExists) {
        throw new ConflictException(
          (await this.duplicateEmailMessage(dto.email, dto.fullName ?? existing.fullName)).replace(
            'registado',
            'em uso',
          ),
        );
      }
    }

    if (dto.employeeNumber && dto.employeeNumber !== existing.employeeNumber) {
      const empExists = await this.prisma.user.findFirst({
        where: { employeeNumber: dto.employeeNumber, id: { not: id } },
      });
      if (empExists) throw new ConflictException('Número de funcionário já em uso');
    }

    const data: Prisma.UserUpdateInput = { ...dto };
    // Nunca deixa passar a senha do DTO em claro (ex.: '' é falsy e escapava ao hash).
    delete data.password;
    if (dto.password) throw new BadRequestException(PASSWORD_BY_ADMIN_MESSAGE);
    if (dto.birthDate) data.birthDate = new Date(dto.birthDate);
    if (dto.hireDate) data.hireDate = new Date(dto.hireDate);
    if (dto.exitDate) data.exitDate = new Date(dto.exitDate);

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: USER_INCLUDE_BASIC,
    });

    await this.logFieldChanges(id, updatedById ?? id, existing, dto, user);
    await this.writeAuditLog(id, updatedById ?? id, 'USER_UPDATED', { fields: Object.keys(dto) });

    const sanitized = this.sanitize(user);
    return emailWarnings.length > 0 ? { ...sanitized, emailWarnings } : sanitized;
  }

  // Regista os eventos granulares do Ponto 6 (Departamento/Cargo/Gestor/Perfil
  // alterado, MFA activado/desactivado) além do USER_UPDATED genérico — só
  // quando o campo realmente muda de valor. `existing`/`updated` já trazem as
  // relações (USER_INCLUDE_BASIC), por isso o "de"/"para" fica com o nome
  // legível em vez do id em bruto.
  private async logFieldChanges(
    userId: number,
    actorId: number,
    existing: {
      departmentId?: number | null;
      positionId?: number | null;
      managerId?: number | null;
      roleId?: number | null;
      mfaEnabled?: boolean;
      department?: { name: string } | null;
      position?: { name: string } | null;
      manager?: { fullName: string } | null;
      role?: { name: string } | null;
    },
    dto: UpdateUserDto,
    updated: {
      department?: { name: string } | null;
      position?: { name: string } | null;
      manager?: { fullName: string } | null;
      role?: { name: string } | null;
    },
  ) {
    if (dto.departmentId !== undefined && dto.departmentId !== existing.departmentId) {
      await this.writeAuditLog(userId, actorId, 'DEPARTMENT_CHANGED', {
        from: existing.department?.name ?? null,
        to: updated.department?.name ?? null,
      });
    }
    if (dto.positionId !== undefined && dto.positionId !== existing.positionId) {
      await this.writeAuditLog(userId, actorId, 'POSITION_CHANGED', {
        from: existing.position?.name ?? null,
        to: updated.position?.name ?? null,
      });
    }
    if (dto.managerId !== undefined && dto.managerId !== existing.managerId) {
      await this.writeAuditLog(userId, actorId, 'MANAGER_CHANGED', {
        from: existing.manager?.fullName ?? null,
        to: updated.manager?.fullName ?? null,
      });
    }
    if (dto.roleId !== undefined && dto.roleId !== existing.roleId) {
      await this.revocation?.invalidateUserCache(userId);
      await this.writeAuditLog(userId, actorId, 'PROFILE_CHANGED', {
        from: existing.role?.name ?? null,
        to: updated.role?.name ?? null,
      });
    }
    if (dto.mfaEnabled !== undefined && dto.mfaEnabled !== existing.mfaEnabled) {
      await this.writeAuditLog(userId, actorId, dto.mfaEnabled ? 'MFA_ENABLED' : 'MFA_DISABLED');
    }
  }

  // ─── PERFIL ───────────────────────────────────────────────────────────────

  async upsertProfile(userId: number, dto: UpdateProfileDto) {
    return this.prisma.profile.upsert({
      where: { userId },
      create: { userId, ...dto, interests: dto.interests ?? [] },
      update: { ...dto, interests: dto.interests ?? undefined },
    });
  }

  async setAvatar(userId: number, avatarUrl: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
    return { avatarUrl };
  }

  async clearAvatar(userId: number) {
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl: null } });
    return { avatarUrl: null as string };
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

  /**
   * Menor privilégio na atribuição de papéis: só ADMIN atribui o papel ADMIN, e quem não é
   * ADMIN não altera o próprio papel. `actorRole` indefinido = chamada interna de confiança
   * (importações, seeds) e não é verificada aqui — a rota HTTP passa sempre o papel real.
   */
  private async assertCanAssignRole(
    roleId: number | null | undefined,
    actorRole: string | undefined,
    isSelf = false,
  ): Promise<void> {
    if (!actorRole || actorRole === 'ADMIN' || roleId == null) return;
    if (isSelf) throw new ForbiddenException('Não podes alterar o teu próprio perfil de acesso');
    const target = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (target?.name === 'ADMIN') {
      throw new ForbiddenException('Só um administrador pode atribuir o perfil ADMIN');
    }
  }

  /** Utilizador deixou de poder entrar: mata os access tokens vivos e a cache em todas as instâncias. */
  private async endSessions(id: number): Promise<void> {
    await this.revocation?.revokeAllUserSessions(id);
    await this.revocation?.invalidateUserCache(id);
  }

  async deactivate(id: number, reason?: string) {
    const user = await this.findOne(id);
    if (user.accountStatus === 'INACTIVE') return user;

    const updated = await this.prisma.user.update({
      where: { id },
      data: { active: false, accountStatus: 'INACTIVE' },
    });
    await this.endSessions(id);
    await this.writeAuditLog(id, id, 'USER_DEACTIVATED', { reason });
    return this.sanitize(updated);
  }

  async suspend(id: number, reason: string) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { active: false, accountStatus: 'SUSPENDED' },
    });
    await this.endSessions(id);
    await this.writeAuditLog(id, id, 'USER_SUSPENDED', { reason });
    return this.sanitize(user);
  }

  // ─── SOFT DELETE ──────────────────────────────────────────────────────────

  async remove(id: number) {
    const user = await this.findOne(id);

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

    await this.endSessions(id);
    await this.writeAuditLog(id, id, 'USER_SOFT_DELETED');
    return { message: 'Utilizador desactivado e marcado como saído (soft delete)' };
  }

  // ─── ALTERAR PASSWORD ─────────────────────────────────────────────────────

  async changePassword(userId: number, dto: UserChangePasswordDto) {
    // Validação de credenciais antes de escrita: força primary (dado sensível, sem réplica atrasada).
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      omit: { password: false },
    });
    if (!user) throw new NotFoundException();

    const valid = user.password && (await verifyPassword(dto.currentPassword, user.password)).valid;
    if (!valid) throw new ForbiddenException('Password actual incorrecta');

    await this.security?.assertPasswordAllowed(dto.newPassword);
    const hashed = await hashPassword(dto.newPassword);
    const now = new Date();

    // Mudar a senha invalida todas as sessões activas (incluindo a actual) —
    // um token roubado antes da troca deixa de servir. O próprio JwtStrategy
    // já rejeita accessTokens emitidos antes de passwordChangedAt.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password: hashed, passwordChangedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    await this.writeAuditLog(userId, userId, 'PASSWORD_CHANGED');
    return { message: 'Password alterada com sucesso. Sessão terminada, inicia sessão novamente.' };
  }

  // ─── EQUIPA DO GESTOR ─────────────────────────────────────────────────────

  async getTeam(managerId: number) {
    const subordinates = await this.prisma.read.user.findMany({
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
          this.prisma.read.enrollment.count({ where: { userId: s.id, status: 'COMPLETED' } }),
          this.prisma.read.enrollment.count({ where: { userId: s.id, status: 'IN_PROGRESS' } }),
          this.prisma.read.enrollment.count({
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
      this.prisma.read.enrollment.count({ where: { userId: id } }),
      this.prisma.read.enrollment.count({ where: { userId: id, status: 'COMPLETED' } }),
      this.prisma.read.enrollment.count({ where: { userId: id, status: 'IN_PROGRESS' } }),
      this.prisma.read.userPoints.findUnique({ where: { userId: id } }),
      this.prisma.read.badgeAward.count({ where: { userId: id } }),
      this.prisma.read.userCompetency.count({ where: { userId: id } }),
      this.prisma.read.enrollment.count({
        where: {
          userId: id,
          deadline: { lt: new Date() },
          status: { notIn: ['COMPLETED', 'EXPIRED'] },
        },
      }),
      this.prisma.read.enrollment.findMany({
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
    const where: Prisma.UserWhereInput = { active: true };
    if (departmentId) where.departmentId = departmentId;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { position: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // Diretório da empresa: devolve campos públicos de TODOS os colaboradores, por desenho
    // (o RLS de utilizador só mostraria o próprio e o gestor).
    const rows = await runAsSystem(() =>
      this.prisma.read.user.findMany({
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
        // Listar um departamento inteiro (sem pesquisa) não tem limite — é usado
        // para adicionar todos os membros a uma turma. Pesquisa livre fica a 100.
        take: departmentId && !search ? undefined : 100,
      }),
    );
    return rows.map(u => ({ ...u, avatarUrl: avatarRef(u.id, u.avatarUrl) }));
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
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        results.errors.push(`User ${userId}: ${message}`);
        this.logger.warn({
          userId,
          action: dto.action,
          err: { message },
          msg: 'Falha ao executar acção em massa para utilizador',
        });
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
        results.created.push(user.id);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        results.errors.push({ line: i + 1, email: users[i].email, error: message });
      }
    }

    return {
      success: results.success,
      errors: results.errors.length,
      total: users.length,
      details: { created: results.created, errors: results.errors },
    };
  }

  // ─── IMPORTAÇÃO (docs/modulo_users.md Ponto 5) ─────────────────────────────
  // Excel/CSV → mapeamento de colunas → validação/duplicados feitos no
  // frontend antes de chegar aqui (ImportUserRowDto já é a linha mapeada).
  // Este serviço só faz a parte que precisa da BD: detectar duplicados
  // reais (nesta remessa e contra utilizadores existentes), resolver
  // departamento/cargo por nome, e criar ou actualizar. `dryRun` devolve o
  // mesmo relatório sem escrever nada — é a pré-visualização.
  async importUsers(dto: ImportUsersDto, actorId: number) {
    const dryRun = dto.dryRun ?? true;
    const updateExisting = dto.updateExisting ?? false;

    const report = {
      total: dto.rows.length,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [] as Array<{ line: number; email: string; error: string }>,
      rows: [] as Array<{
        line: number;
        email: string;
        outcome: 'create' | 'update' | 'skip-duplicate' | 'skip-existing' | 'error';
        detail?: string;
      }>,
    };

    const seenInFile = new Set<string>();
    // Lida uma só vez: a importação pode ter milhares de linhas.
    const emailPolicy = await this.settings?.getEmailPolicy();

    for (let i = 0; i < dto.rows.length; i++) {
      const line = i + 1;
      const row = dto.rows[i];
      const email = row.email?.trim().toLowerCase();

      try {
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          throw new Error('Email inválido ou em falta');
        }
        if (!row.fullName || row.fullName.trim().length < 2) {
          throw new Error('Nome completo inválido ou em falta');
        }
        // ENFORCE rejeita só esta linha (vai para o relatório); SUGGEST segue com aviso.
        let policyWarning: string | undefined;
        if (emailPolicy) {
          try {
            const warnings = await this.applyEmailPolicy(email, emailPolicy);
            if (warnings.length > 0) policyWarning = warnings.join(' ');
          } catch (e: unknown) {
            const violations = e instanceof BadRequestException ? e.getResponse() : null;
            const msg =
              violations && typeof violations === 'object' && 'message' in violations
                ? [(violations as { message: string | string[] }).message].flat().join(' ')
                : 'Email fora do formato da organização';
            throw new Error(msg);
          }
        }

        // Duplicado dentro do próprio ficheiro — não deixar a 2ª ocorrência
        // pisar a 1ª silenciosamente.
        if (seenInFile.has(email)) {
          report.skipped++;
          report.rows.push({
            line,
            email,
            outcome: 'skip-duplicate',
            detail: 'Email repetido no ficheiro',
          });
          continue;
        }
        seenInFile.add(email);

        const [department, position, existing] = await Promise.all([
          row.departmentName
            ? this.prisma.department.findFirst({
                where: { name: { equals: row.departmentName, mode: 'insensitive' } },
              })
            : Promise.resolve(null),
          row.positionName
            ? this.prisma.position.findFirst({
                where: { name: { equals: row.positionName, mode: 'insensitive' } },
              })
            : Promise.resolve(null),
          this.prisma.user.findUnique({ where: { email } }),
        ]);

        if (row.departmentName && !department)
          throw new Error(`Departamento "${row.departmentName}" não existe`);
        if (row.positionName && !position)
          throw new Error(`Cargo "${row.positionName}" não existe`);

        if (existing) {
          if (!updateExisting) {
            report.skipped++;
            report.rows.push({
              line,
              email,
              outcome: 'skip-existing',
              detail: 'Já existe — actualização não pedida',
            });
            continue;
          }
          if (!dryRun) {
            await this.update(
              existing.id,
              {
                fullName: row.fullName,
                employeeNumber: row.employeeNumber,
                phone: row.phone,
                departmentId: department?.id,
                positionId: position?.id,
                hireDate: row.hireDate,
              },
              actorId,
            );
          }
          report.updated++;
          report.rows.push({ line, email, outcome: 'update', detail: policyWarning });
        } else {
          if (!dryRun) {
            await this.create(
              {
                email,
                fullName: row.fullName,
                employeeNumber: row.employeeNumber,
                phone: row.phone,
                departmentId: department?.id,
                positionId: position?.id,
                hireDate: row.hireDate,
                accountStatus: AccountStatus.PENDING,
              },
              actorId,
            );
          }
          report.created++;
          report.rows.push({ line, email, outcome: 'create', detail: policyWarning });
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        report.errors.push({ line, email: email ?? row.email, error: message });
        report.rows.push({ line, email: email ?? row.email, outcome: 'error', detail: message });
      }
    }

    // Relatório de importação (Histórico de importações) — só regista quando
    // é uma escrita real; uma pré-visualização (dryRun) não é um evento.
    if (!dryRun) {
      await this.writeAuditLog(actorId, actorId, 'BULK_IMPORT', {
        total: report.total,
        created: report.created,
        updated: report.updated,
        skipped: report.skipped,
        errors: report.errors.length,
      });
    }

    return { ...report, dryRun };
  }

  // ─── CONVIDAR UTILIZADOR ──────────────────────────────────────────────────

  async invite(dto: InviteUserDto) {
    if (this.settings) dto = await this.settings.applyUserPolicy(dto, { invite: true });

    // Guard de unicidade antes da escrita: força primary.
    // A validação do formato do tenant corre em create(), chamado logo abaixo.
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) {
      throw new ConflictException(await this.duplicateEmailMessage(dto.email, dto.fullName));
    }

    // Mudança deliberada (Fase J): o utilizador é criado primeiro e o email de
    // convite vai para a fila `email` (retry gerido pelo Bull). Deixa de
    // bloquear a resposta e de impedir a criação quando o SMTP está em baixo.
    const user = await this.create(
      {
        ...dto,
        accountStatus: AccountStatus.PENDING,
      },
      undefined,
      { skipPolicy: true },
    );

    const expiryDays = this.settings
      ? (await this.settings.getUserPolicy()).invitationExpiryDays
      : undefined;
    await this.emailQueue.add(
      'userInvite',
      { userId: user.id, email: dto.email, fullName: dto.fullName, expiryDays },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: true },
    );

    await this.prisma.notificationLog
      .create({
        data: {
          userId: user.id,
          type: 'INVITE_SENT',
          message: `Convite enviado para ${dto.email}`,
        },
      })
      .catch((e: unknown) => {
        this.logger.warn({
          userId: user.id,
          action: 'INVITE_SENT',
          err: { message: e instanceof Error ? e.message : String(e) },
          msg: 'Falha ao registar notificação de convite',
        });
      });

    return { message: 'Convite enviado', userId: user.id };
  }

  // ─── ACESSO & PERMISSÕES (docs/modulo_users.md Ponto 4) ────────────────────
  // Campos sem dados reais na plataforma hoje (dispositivos, tentativas de
  // login, histórico de bloqueios) voltam explicitamente `null` — ver
  // memory project_innova_acl_permission_ownership: não fabricar dados,
  // sinalizar a lacuna para o frontend em vez de inventar histórico.
  async getAccessOverview(id: number) {
    const user = await this.prisma.read.user.findUnique({
      where: { id },
      select: {
        id: true,
        accountStatus: true,
        mfaEnabled: true,
        systemFunction: true,
        contentAccessLevel: true,
        createdAt: true,
        unit: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        role: {
          select: {
            id: true,
            name: true,
            code: true,
            rolePermissions: { include: { permission: true } },
          },
        },
        additionalPermissions: {
          select: { grantedAt: true, permission: true },
        },
      },
    });
    if (!user) throw new NotFoundException(`Utilizador #${id} não encontrado`);

    const rolePermissions = user.role ? flattenRolePermissions(user.role.rolePermissions) : [];
    const specialPermissions = user.additionalPermissions.map(p => ({
      ...p.permission,
      grantedAt: p.grantedAt,
    }));
    const authorizedModules = Array.from(
      new Set([...rolePermissions, ...specialPermissions].map(p => p.subject)),
    );

    const now = new Date();
    const [lastToken, activeSessions] = await Promise.all([
      this.prisma.read.refreshToken.findFirst({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
      this.prisma.read.refreshToken.count({
        where: { userId: id, revokedAt: null, expiresAt: { gt: now } },
      }),
    ]);

    return {
      userId: id,
      accountStatus: user.accountStatus,
      accountCreatedAt: user.createdAt,
      profile: user.role ? { id: user.role.id, name: user.role.name, code: user.role.code } : null,
      systemFunction: user.systemFunction,
      contentAccessLevel: user.contentAccessLevel,
      permissions: rolePermissions,
      specialPermissions,
      authorizedModules,
      authorizedUnit: user.unit,
      authorizedDepartment: user.department,
      mfaEnabled: user.mfaEnabled,
      lastLoginAt: lastToken?.createdAt ?? null,
      activeSessions,
      // Não existe modelo/registo de dispositivos, tentativas de login ou
      // histórico de bloqueios nesta plataforma — ver relatório de research
      // desta funcionalidade. Devolvido explicitamente para o frontend
      // assinalar "não disponível" em vez de omitir a secção.
      devices: null as unknown,
      loginAttempts: null as unknown,
      blockHistory: null as unknown,
    };
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
    } catch (e: unknown) {
      this.logger.warn({
        userId,
        performedById,
        action,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao escrever audit log de utilizador',
      });
    }
  }

  async getAuditLogs(userId: number, page = 1, limit = 30) {
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.read.userAuditLog.findMany({
        where: { userId },
        skip,
        take,
        include: { performedBy: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.userAuditLog.count({ where: { userId } }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  // ─── HISTÓRICO & AUDITORIA — nível de módulo (docs/modulo_users.md Ponto 6) ─
  // Mesma tabela UserAuditLog do separador "Histórico" do perfil individual
  // (getAuditLogs acima), aqui sem filtrar por um único utilizador — cobre
  // todas as acções da lista do Ponto 6 (criado, dados/departamento/cargo/
  // gestor/perfil alterado, conta activada/desactivada, password alterada,
  // MFA, login, logout, importações) porque write AuditLog() e o login/logout
  // do AuthService escrevem todos na mesma tabela.
  async getModuleAuditLogs(filters: ModuleAuditLogFilterDto) {
    const { page = 1, limit = 30, action, userId, from, to } = filters;
    const { skip, take } = calculatePagination(page, limit);

    const where: Prisma.UserAuditLogWhereInput = {};
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.read.userAuditLog.findMany({
        where,
        skip,
        take,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          performedBy: { select: { id: true, fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.read.userAuditLog.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  // ─── DASHBOARD DO ADMIN ───────────────────────────────────────────────────

  async getAdminDashboard() {
    const [totalUsers, activeUsers, pendingUsers, suspendedUsers, byDepartment] = await Promise.all(
      [
        this.prisma.read.user.count(),
        this.prisma.read.user.count({ where: { active: true } }),
        this.prisma.read.user.count({ where: { accountStatus: 'PENDING' } }),
        this.prisma.read.user.count({ where: { accountStatus: 'SUSPENDED' } }),
        this.prisma.read.department.findMany({
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
        count: d._count.users,
      })),
    };
  }
}
