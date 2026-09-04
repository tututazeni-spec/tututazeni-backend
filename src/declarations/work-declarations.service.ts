// ─── src/declarations/work-declarations.service.ts ───────────────────────────
// Módulo 2 — Work Declarations
// Responsabilidade: formulários dinâmicos de compliance, onboarding, periódicos
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, WorkDeclSubmission } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/services/audit.service';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';
import { CurrentUserData } from '../common/decorators';
import { createNotificationSafe } from '../common/helpers/notification.helper';
import {
  CreateWorkDeclFormDto,
  UpdateWorkDeclFormDto,
  SubmitWorkDeclDto,
  ReviewWorkDeclDto,
  BulkApproveWorkDeclDto,
  WorkDeclFilterDto,
  WorkDeclStatus,
  WorkDeclType,
} from './declarations.dto';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class WorkDeclarationsService {
  private readonly logger = new Logger(WorkDeclarationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // FORM DEFINITIONS (Admin/RH)
  // ══════════════════════════════════════════════════════════════════

  async createForm(dto: CreateWorkDeclFormDto, createdById: number) {
    const { questions, ...rest } = dto;

    const form = await this.prisma.workDeclForm.create({
      data: {
        ...rest,
        active: rest.active ?? true,
        mandatory: rest.mandatory ?? false,
        requiresDigitalSignature: rest.requiresDigitalSignature ?? false,
        targetAllEmployees: rest.targetAllEmployees ?? true,
        targetDepartments: rest.targetDepartments ?? [],
        targetRoles: rest.targetRoles ?? [],
        validFrom: rest.validFrom ? new Date(rest.validFrom) : new Date(),
        validTo: rest.validTo ? new Date(rest.validTo) : null,
        createdById,
        questions: {
          create: questions.map((q, idx) => ({
            ...q,
            order: q.order ?? idx,
            required: q.required ?? false,
            options: q.options ?? [],
            acceptedFileTypes: q.acceptedFileTypes ?? [],
          })),
        },
      },
      include: { questions: { orderBy: { order: 'asc' } } },
    });

    await this.audit.log({
      action: 'WORK_DECL_FORM_CREATED',
      entityType: 'WorkDeclForm',
      entityId: form.id,
      userId: createdById,
    });
    return form;
  }

  async getForms(type?: WorkDeclType, activeOnly = true) {
    return this.prisma.read.workDeclForm.findMany({
      where: {
        ...(activeOnly ? { active: true } : {}),
        ...(type ? { type } : {}),
      },
      include: {
        questions: { orderBy: { order: 'asc' } },
        _count: { select: { submissions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getForm(id: number) {
    const f = await this.prisma.read.workDeclForm.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!f) throw new NotFoundException('Formulário não encontrado');
    return f;
  }

  async updateForm(id: number, dto: UpdateWorkDeclFormDto, updatedById: number) {
    const { questions, ...rest } = dto;
    const updated: Prisma.WorkDeclFormUpdateInput = { ...rest };
    if (rest.validFrom) updated.validFrom = new Date(rest.validFrom);
    if (rest.validTo) updated.validTo = new Date(rest.validTo);

    if (questions) {
      await this.prisma.workDeclQuestion.deleteMany({ where: { formId: id } });
      updated.questions = {
        create: questions.map((q, idx) => ({
          ...q,
          order: q.order ?? idx,
          required: q.required ?? false,
          options: q.options ?? [],
          acceptedFileTypes: q.acceptedFileTypes ?? [],
        })),
      };
    }

    return this.prisma.workDeclForm.update({
      where: { id },
      data: updated,
      include: { questions: { orderBy: { order: 'asc' } } },
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // PENDING FOR USER (Employee Dashboard)
  // ══════════════════════════════════════════════════════════════════

  async getPendingForUser(userId: number) {
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        department: { select: { name: true } },
        role: { select: { code: true } },
      },
    });
    if (!user) throw new NotFoundException();

    // Buscar todos os forms activos dirigidos a este colaborador
    const allForms = await this.prisma.read.workDeclForm.findMany({
      where: {
        active: true,
        OR: [
          { targetAllEmployees: true },
          { targetDepartments: { has: user.department?.name ?? '' } },
          { targetRoles: { has: user.role?.code ?? '' } },
        ],
      },
    });

    // Quais já foram submetidos?
    const submitted = await this.prisma.read.workDeclSubmission.findMany({
      where: {
        userId,
        status: { in: [WorkDeclStatus.SUBMITTED, WorkDeclStatus.APPROVED] },
      },
      select: { formId: true },
    });
    const submittedIds = new Set(submitted.map(s => s.formId));

    const pending = allForms.filter(f => !submittedIds.has(f.id));
    const drafts = await this.prisma.read.workDeclSubmission.findMany({
      where: { userId, status: WorkDeclStatus.DRAFT },
      include: { form: { select: { id: true, title: true, type: true } } },
    });

    return { pending, drafts, total: pending.length };
  }

  // ══════════════════════════════════════════════════════════════════
  // SUBMISSIONS
  // ══════════════════════════════════════════════════════════════════

  async findSubmissions(filters: WorkDeclFilterDto) {
    const { page = 1, limit = 20, userId, formId, type, status, department, from, to } = filters;
    const skip = (page - 1) * limit;
    const where: Prisma.WorkDeclSubmissionWhereInput = {};

    if (userId) where.userId = userId;
    if (formId) where.formId = formId;
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    if (type) where.form = { type };
    if (department)
      where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const [data, total] = await Promise.all([
      this.prisma.read.workDeclSubmission.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          form: { select: { id: true, title: true, type: true, mandatory: true } },
          user: { select: { id: true, fullName: true, email: true } },
          answers: { include: { question: { select: { key: true, label: true } } } },
          review: { include: { reviewer: { select: { id: true, fullName: true } } } },
        },
      }),
      this.prisma.read.workDeclSubmission.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOneSubmission(id: number, user?: CurrentUserData) {
    const s = await this.prisma.read.workDeclSubmission.findUnique({
      where: { id },
      include: {
        form: { include: { questions: { orderBy: { order: 'asc' } } } },
        user: { select: { id: true, fullName: true, email: true } },
        answers: { include: { question: true }, orderBy: { question: { order: 'asc' } } },
        review: { include: { reviewer: { select: { id: true, fullName: true } } } },
      },
    });
    // A10-19: sem isto, qualquer autenticado lia a submissão de compliance de
    // qualquer colega por GET /declarations/work/submissions/:id. Chamadas
    // internas sem `user` (review/bulk-approve) mantêm-se sem filtro.
    if (user) {
      assertCanAccess(s, s?.userId, user, [Role.ADMIN, Role.RH]);
    } else if (!s) {
      throw new NotFoundException('Submissão não encontrada');
    }
    return s;
  }

  async submit(userId: number, dto: SubmitWorkDeclDto) {
    const form = await this.getForm(dto.formId);
    if (!form.active) throw new BadRequestException('Formulário inactivo');

    // @@unique([userId, formId]) — só pode existir uma submissão por par utilizador/formulário,
    // por isso a procura tem de encontrar também os rascunhos (senão a 2ª gravação nunca
    // encontra a 1ª e o create() seguinte rebenta com violação da unique constraint).
    const existing = await this.prisma.workDeclSubmission.findFirst({
      where: { userId, formId: dto.formId },
    });
    if (
      existing?.status === WorkDeclStatus.SUBMITTED ||
      existing?.status === WorkDeclStatus.APPROVED
    ) {
      throw new BadRequestException('Já existe uma submissão activa para este formulário');
    }

    // Validar campos obrigatórios
    if (!dto.saveAsDraft) {
      const requiredKeys = form.questions.filter(q => q.required).map(q => q.key);
      const answeredKeys = dto.answers.map(a => a.key);
      const missing = requiredKeys.filter(k => !answeredKeys.includes(k));
      if (missing.length > 0) {
        throw new BadRequestException(`Campos obrigatórios em falta: ${missing.join(', ')}`);
      }
    }

    const status = dto.saveAsDraft ? WorkDeclStatus.DRAFT : WorkDeclStatus.SUBMITTED;

    // Upsert: qualquer submissão anterior (DRAFT/REJECTED/EXPIRED) é actualizada in-place —
    // o par [userId, formId] é único, nunca se pode criar uma segunda linha.
    let submission: WorkDeclSubmission;
    if (existing) {
      // Apagar respostas antigas
      await this.prisma.workDeclAnswer.deleteMany({ where: { submissionId: existing.id } });
      submission = await this.prisma.workDeclSubmission.update({
        where: { id: existing.id },
        data: {
          status,
          signature: dto.signature,
          submittedAt: !dto.saveAsDraft ? new Date() : undefined,
          answers: {
            create: dto.answers.map(a => ({
              questionKey: a.key,
              value: typeof a.value === 'object' ? JSON.stringify(a.value) : String(a.value ?? ''),
            })),
          },
        },
      });
    } else {
      submission = await this.prisma.workDeclSubmission.create({
        data: {
          userId,
          formId: dto.formId,
          status,
          signature: dto.signature,
          submittedAt: !dto.saveAsDraft ? new Date() : undefined,
          answers: {
            create: dto.answers.map(a => ({
              questionKey: a.key,
              value: typeof a.value === 'object' ? JSON.stringify(a.value) : String(a.value ?? ''),
            })),
          },
        },
      });
    }

    if (!dto.saveAsDraft) {
      await this.notifyUser(userId, 'WORK_DECL_SUBMITTED', `"${form.title}" submetida com sucesso`);
      if (form.mandatory) {
        await this.notifyRH('WORK_DECL_PENDING', `Nova declaração "${form.title}" aguarda revisão`);
      }
      await this.audit.log({
        action: 'WORK_DECL_SUBMITTED',
        entityType: 'WorkDeclSubmission',
        entityId: submission.id,
        userId,
        metadata: {},
      });
    }

    return submission;
  }

  async review(submissionId: number, dto: ReviewWorkDeclDto, reviewerId: number) {
    const sub = await this.findOneSubmission(submissionId);
    if (sub.status !== WorkDeclStatus.SUBMITTED)
      throw new BadRequestException('Submissão não está pendente de revisão');

    const newStatus = dto.approved ? WorkDeclStatus.APPROVED : WorkDeclStatus.REJECTED;

    await this.prisma.workDeclSubmission.update({
      where: { id: submissionId },
      data: { status: newStatus, reviewedAt: new Date() },
    });

    await this.prisma.workDeclReview.upsert({
      where: { submissionId },
      create: {
        submissionId,
        reviewerId,
        approved: dto.approved,
        notes: dto.notes,
        correctionFields: dto.correctionFields ?? [],
        reviewedAt: new Date(),
      },
      update: {
        reviewerId,
        approved: dto.approved,
        notes: dto.notes,
        correctionFields: dto.correctionFields ?? [],
        reviewedAt: new Date(),
      },
    });

    const msg = dto.approved
      ? `A sua declaração "${sub.form?.title}" foi aprovada`
      : `A sua declaração "${sub.form?.title}" foi rejeitada${dto.notes ? `: ${dto.notes}` : ''}`;
    await this.notifyUser(
      sub.userId,
      dto.approved ? 'WORK_DECL_APPROVED' : 'WORK_DECL_REJECTED',
      msg,
    );

    await this.audit.log({
      action: dto.approved ? 'WORK_DECL_APPROVED' : 'WORK_DECL_REJECTED',
      entityType: 'WorkDeclSubmission',
      entityId: submissionId,
      userId: reviewerId,
    });

    return this.findOneSubmission(submissionId);
  }

  async bulkApprove(dto: BulkApproveWorkDeclDto, reviewerId: number) {
    const results = await Promise.allSettled(
      dto.submissionIds.map(id =>
        this.review(id, { approved: dto.approved, notes: dto.notes }, reviewerId),
      ),
    );
    return {
      success: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
    };
  }

  async sendReminder(formId: number, department?: string) {
    const form = await this.getForm(formId);
    // Buscar utilizadores que ainda não submeteram
    const submitted = await this.prisma.read.workDeclSubmission.findMany({
      where: { formId, status: { not: WorkDeclStatus.DRAFT } },
      select: { userId: true },
    });
    const submittedIds = new Set(submitted.map(s => s.userId));

    const where: Prisma.UserWhereInput = {};
    if (department) where.department = { name: { contains: department, mode: 'insensitive' } };

    const users = await this.prisma.read.user.findMany({ where, select: { id: true } });
    const pending = users.filter(u => !submittedIds.has(u.id));

    await Promise.allSettled(
      pending.map(u =>
        createNotificationSafe(this.prisma, this.logger, {
          userId: u.id,
          type: 'WORK_DECL_REMINDER',
          message: `Lembrete: "${form.title}" está pendente de preenchimento`,
        }),
      ),
    );

    return { sent: pending.length };
  }

  async exemptUser(submissionId: number, reason: string, exemptedById: number) {
    await this.findOneSubmission(submissionId);
    await this.prisma.workDeclSubmission.update({
      where: { id: submissionId },
      data: { status: WorkDeclStatus.APPROVED, exemptionReason: reason, reviewedAt: new Date() },
    });
    await this.audit.log({
      action: 'WORK_DECL_EXEMPTED',
      entityType: 'WorkDeclSubmission',
      entityId: submissionId,
      userId: exemptedById,
      metadata: {},
    });
    return { message: 'Isento com sucesso' };
  }

  // ══════════════════════════════════════════════════════════════════
  // ANALYTICS / DASHBOARD
  // ══════════════════════════════════════════════════════════════════

  async getDashboard(department?: string) {
    const where: Prisma.WorkDeclSubmissionWhereInput = {};
    // Achado real: `user.employee` — User NUNCA teve relação `employee`
    // (mesmo achado já corrigido em document-declarations.service.ts) —
    // este where rebentava sempre com "Unknown argument employee" sempre
    // que o parâmetro `department` era fornecido, mascarado pelo
    // `where: any`. User.department é a relação real.
    if (department)
      where.user = { department: { name: { contains: department, mode: 'insensitive' } } };

    const [total, pending, approved, rejected, expired] = await Promise.all([
      this.prisma.read.workDeclSubmission.count({ where }),
      this.prisma.read.workDeclSubmission.count({
        where: { ...where, status: WorkDeclStatus.SUBMITTED },
      }),
      this.prisma.read.workDeclSubmission.count({
        where: { ...where, status: WorkDeclStatus.APPROVED },
      }),
      this.prisma.read.workDeclSubmission.count({
        where: { ...where, status: WorkDeclStatus.REJECTED },
      }),
      this.prisma.read.workDeclSubmission.count({
        where: { ...where, status: WorkDeclStatus.EXPIRED },
      }),
    ]);

    const byType = await this.prisma.read.workDeclSubmission.groupBy({
      by: ['formId'],
      where,
      _count: true,
    });

    const completionRate = total > 0 ? +((approved / total) * 100).toFixed(1) : 0;

    return {
      kpis: { total, pending, approved, rejected, expired, completionRate },
      byType,
    };
  }

  async getComplianceReport(department?: string) {
    const forms = await this.prisma.read.workDeclForm.findMany({
      where: { active: true, mandatory: true },
    });
    const where: Prisma.UserWhereInput = { active: true };
    if (department) where.department = { name: { contains: department, mode: 'insensitive' } };

    const users = await this.prisma.read.user.findMany({
      where,
      select: { id: true, fullName: true, department: { select: { name: true } } },
    });

    const submissions = await this.prisma.read.workDeclSubmission.findMany({
      where: {
        formId: { in: forms.map(f => f.id) },
        status: { in: [WorkDeclStatus.SUBMITTED, WorkDeclStatus.APPROVED] },
      },
      select: { userId: true, formId: true },
    });

    const submitted = new Set(submissions.map(s => `${s.userId}:${s.formId}`));

    const report = users.map(u => {
      const completedForms = forms.filter(f => submitted.has(`${u.id}:${f.id}`)).length;
      return {
        userId: u.id,
        name: u.fullName,
        department: u.department?.name,
        completedForms,
        totalForms: forms.length,
        complianceRate: forms.length > 0 ? +((completedForms / forms.length) * 100).toFixed(0) : 0,
        pending: forms.filter(f => !submitted.has(`${u.id}:${f.id}`)).map(f => f.title),
      };
    });

    const overallRate =
      report.length > 0
        ? +(report.reduce((a, r) => a + r.complianceRate, 0) / report.length).toFixed(1)
        : 0;

    return { overallRate, report: report.sort((a, b) => a.complianceRate - b.complianceRate) };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async notifyUser(userId: number, type: string, message: string) {
    await createNotificationSafe(this.prisma, this.logger, { userId, type, message });
  }

  private async notifyRH(type: string, message: string) {
    try {
      const hr = await this.prisma.read.user.findFirst({ where: { role: { code: 'RH' } } });
      if (hr)
        await createNotificationSafe(this.prisma, this.logger, { userId: hr.id, type, message });
    } catch (e: unknown) {
      this.logger.warn({
        type,
        err: { message: e instanceof Error ? e.message : String(e) },
        msg: 'Falha ao notificar RH',
      });
    }
  }

  // ── Auto-trigger (chamado por outros módulos) ─────────────────────────────

  async triggerOnboarding(userId: number) {
    const forms = await this.prisma.read.workDeclForm.findMany({
      where: { type: WorkDeclType.ONBOARDING, active: true },
    });
    // Criar submissões em estado DRAFT para o utilizador preencher
    await this.prisma.workDeclSubmission.createMany({
      data: forms.map(f => ({ userId, formId: f.id, status: WorkDeclStatus.PENDING })),
      skipDuplicates: true,
    });
    for (const f of forms) {
      await this.notifyUser(
        userId,
        'ONBOARDING_DECLARATION',
        `Complete a declaração de onboarding: "${f.title}"`,
      );
    }
    return { triggered: forms.length };
  }

  async triggerPeriodic() {
    const today = new Date();
    const forms = await this.prisma.read.workDeclForm.findMany({
      where: { type: WorkDeclType.PERIODIC, active: true, periodicity: 'ANNUAL' },
    });

    let triggered = 0;
    for (const form of forms) {
      const users = await this.prisma.read.user.findMany({ select: { id: true } });
      for (const user of users) {
        const alreadyDone = await this.prisma.read.workDeclSubmission.findFirst({
          where: {
            userId: user.id,
            formId: form.id,
            createdAt: { gte: new Date(today.getFullYear(), 0, 1) },
            status: { in: [WorkDeclStatus.SUBMITTED, WorkDeclStatus.APPROVED] },
          },
        });
        if (!alreadyDone) {
          await this.notifyUser(
            user.id,
            'PERIODIC_DECLARATION',
            `A declaração "${form.title}" requer actualização anual`,
          );
          triggered++;
        }
      }
    }
    return { triggered };
  }
}
