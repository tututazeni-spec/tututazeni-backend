// ─── src/declarations/work-declarations.service.ts ───────────────────────────
// Módulo 2 — Work Declarations
// Responsabilidade: formulários dinâmicos de compliance, onboarding, periódicos
// ─────────────────────────────────────────────────────────────────────────────
import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService }  from '../common/services/audit.service';
import {
  CreateWorkDeclFormDto, UpdateWorkDeclFormDto,
  SubmitWorkDeclDto, ReviewWorkDeclDto, BulkApproveWorkDeclDto,
  WorkDeclFilterDto,
  WorkDeclStatus, WorkDeclType,
} from './declarations.dto';

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class WorkDeclarationsService {
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

    await this.audit.log({ action: 'WORK_DECL_FORM_CREATED', entityType: 'WorkDeclForm', entityId: form.id, userId: createdById });
    return form;
  }

  async getForms(type?: WorkDeclType, activeOnly = true) {
    return this.prisma.workDeclForm.findMany({
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
    const f = await this.prisma.workDeclForm.findUnique({
      where: { id },
      include: { questions: { orderBy: { order: 'asc' } } },
    });
    if (!f) throw new NotFoundException('Formulário não encontrado');
    return f;
  }

  async updateForm(id: number, dto: UpdateWorkDeclFormDto, updatedById: number) {
    const { questions, ...rest } = dto;
    const updated: any = { ...rest };
    if (rest.validFrom) updated.validFrom = new Date(rest.validFrom);
    if (rest.validTo)   updated.validTo   = new Date(rest.validTo);

    if (questions) {
      await this.prisma.workDeclQuestion.deleteMany({ where: { formId: id } });
      updated.questions = {
        create: questions.map((q, idx) => ({
          ...q, order: q.order ?? idx, required: q.required ?? false,
          options: q.options ?? [], acceptedFileTypes: q.acceptedFileTypes ?? [],
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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, departmentId: true, roleId: true },
    });
    if (!user) throw new NotFoundException();

    // Buscar todos os forms activos dirigidos a este colaborador
    const allForms = await this.prisma.workDeclForm.findMany({
      where: {
        active: true,
        OR: [
          { targetAllEmployees: true },
          { targetDepartments: { has: (user as any).employee?.department ?? '' } },
          { targetRoles: { has: (user as any).employee?.role ?? '' } },
        ],
      },
    });

    // Quais já foram submetidos?
    const submitted = await this.prisma.workDeclSubmission.findMany({
      where: {
        userId,
        status: { in: [WorkDeclStatus.SUBMITTED, WorkDeclStatus.APPROVED] },
      },
      select: { formId: true },
    });
    const submittedIds = new Set(submitted.map(s => s.formId));

    const pending = allForms.filter(f => !submittedIds.has(f.id));
    const drafts  = await this.prisma.workDeclSubmission.findMany({
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
    const where: any = {};

    if (userId) where.userId = userId;
    if (formId) where.formId = formId;
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to)   where.createdAt.lte = new Date(to);
    }
    if (type)       where.form = { type };
    if (department) where.user = { employee: { department: { contains: department, mode: 'insensitive' } } };

    const [data, total] = await Promise.all([
      this.prisma.workDeclSubmission.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          form: { select: { id: true, title: true, type: true, mandatory: true } },
          user:   { select: { id: true, fullName: true, email: true } },
          answers: { include: { question: { select: { key: true, label: true } } } },
          review: { include: { reviewer: { select: { id: true, fullName: true } } } },
        },
      }),
      this.prisma.workDeclSubmission.count({ where }),
    ]);

    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOneSubmission(id: number) {
    const s = await this.prisma.workDeclSubmission.findUnique({
      where: { id },
      include: {
        form: { include: { questions: { orderBy: { order: 'asc' } } } },
        user:   { select: { id: true, fullName: true, email: true } },
        answers: { include: { question: true }, orderBy: { question: { order: 'asc' } } },
        review: { include: { reviewer: { select: { id: true, fullName: true } } } },
      },
    });
    if (!s) throw new NotFoundException('Submissão não encontrada');
    return s;
  }

  async submit(userId: number, dto: SubmitWorkDeclDto) {
    const form = await this.getForm(dto.formId);
    if (!form.active) throw new BadRequestException('Formulário inactivo');

    // Verificar se já existe uma submissão não-rascunho
    const existing = await this.prisma.workDeclSubmission.findFirst({
      where: { userId, formId: dto.formId, status: { not: WorkDeclStatus.DRAFT } },
    });
    if (existing?.status === WorkDeclStatus.SUBMITTED || existing?.status === WorkDeclStatus.APPROVED) {
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

    const status  = dto.saveAsDraft ? WorkDeclStatus.DRAFT : WorkDeclStatus.SUBMITTED;

    // Upsert: actualizar rascunho ou criar nova
    let submission: any;
    if (existing?.status === WorkDeclStatus.DRAFT) {
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
      await this.audit.log({ action: 'WORK_DECL_SUBMITTED', entityType: 'WorkDeclSubmission', entityId: submission.id, userId, metadata: { form: form.title } });
    }

    return submission;
  }

  async review(submissionId: number, dto: ReviewWorkDeclDto, reviewerId: number) {
    const sub = await this.findOneSubmission(submissionId);
    if (sub.status !== WorkDeclStatus.SUBMITTED) throw new BadRequestException('Submissão não está pendente de revisão');

    const newStatus = dto.approved ? WorkDeclStatus.APPROVED : WorkDeclStatus.REJECTED;

    await this.prisma.workDeclSubmission.update({
      where: { id: submissionId },
      data: { status: newStatus, reviewedAt: new Date() },
    });

    await this.prisma.workDeclReview.upsert({
      where: { submissionId },
      create: { submissionId, reviewerId, approved: dto.approved, notes: dto.notes, correctionFields: dto.correctionFields ?? [], reviewedAt: new Date() },
      update: { reviewerId, approved: dto.approved, notes: dto.notes, correctionFields: dto.correctionFields ?? [], reviewedAt: new Date() },
    });

    const msg = dto.approved
     ? `A sua declaração "${(sub as any).form?.title}" foi aprovada`
     : `A sua declaração "${(sub as any).form?.title}" foi rejeitada${dto.notes ? `: ${dto.notes}` : ''}`;
    await this.notifyUser(sub.userId, dto.approved ? 'WORK_DECL_APPROVED' : 'WORK_DECL_REJECTED', msg);

    await this.audit.log({
      action: dto.approved ? 'WORK_DECL_APPROVED' : 'WORK_DECL_REJECTED',
      entityType: 'WorkDeclSubmission', entityId: submissionId, userId: reviewerId,
    });

    return this.findOneSubmission(submissionId);
  }

  async bulkApprove(dto: BulkApproveWorkDeclDto, reviewerId: number) {
    const results = await Promise.allSettled(
      dto.submissionIds.map(id =>
        this.review(id, { approved: dto.approved, notes: dto.notes }, reviewerId)
      )
    );
    return {
      success: results.filter(r => r.status === 'fulfilled').length,
      failed:  results.filter(r => r.status === 'rejected').length,
    };
  }

  async sendReminder(formId: number, department?: string) {
    const form = await this.getForm(formId);
    // Buscar utilizadores que ainda não submeteram
    const submitted = await this.prisma.workDeclSubmission.findMany({
      where: { formId, status: { not: WorkDeclStatus.DRAFT } },
      select: { userId: true },
    });
    const submittedIds = new Set(submitted.map(s => s.userId));

    const where: any = {};
    if (department) where.employee = { department: { contains: department, mode: 'insensitive' } };

    const users = await this.prisma.user.findMany({ where, select: { id: true } });
    const pending = users.filter(u => !submittedIds.has(u.id));

    await Promise.allSettled(
      pending.map(u =>
        this.prisma.notificationLog.create({
          data: { userId: u.id, type: 'WORK_DECL_REMINDER', message: `Lembrete: "${form.title}" está pendente de preenchimento`, success: true },
        })
      )
    );

    return { sent: pending.length };
  }

  async exemptUser(submissionId: number, reason: string, exemptedById: number) {
    const sub = await this.findOneSubmission(submissionId);
    await this.prisma.workDeclSubmission.update({
      where: { id: submissionId },
      data: { status: WorkDeclStatus.APPROVED, exemptionReason: reason, reviewedAt: new Date() },
    });
    await this.audit.log({ action: 'WORK_DECL_EXEMPTED', entityType: 'WorkDeclSubmission', entityId: submissionId, userId: exemptedById, metadata: { reason } });
    return { message: 'Isento com sucesso' };
  }

  // ══════════════════════════════════════════════════════════════════
  // ANALYTICS / DASHBOARD
  // ══════════════════════════════════════════════════════════════════

  async getDashboard(department?: string) {
    const where: any = {};
    if (department) where.user = { employee: { department: { contains: department, mode: 'insensitive' } } };

    const [total, pending, approved, rejected, expired] = await Promise.all([
      this.prisma.workDeclSubmission.count({ where }),
      this.prisma.workDeclSubmission.count({ where: { ...where, status: WorkDeclStatus.SUBMITTED } }),
      this.prisma.workDeclSubmission.count({ where: { ...where, status: WorkDeclStatus.APPROVED } }),
      this.prisma.workDeclSubmission.count({ where: { ...where, status: WorkDeclStatus.REJECTED } }),
      this.prisma.workDeclSubmission.count({ where: { ...where, status: WorkDeclStatus.EXPIRED } }),
    ]);

    const byType = await this.prisma.workDeclSubmission.groupBy({
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
    const forms    = await this.prisma.workDeclForm.findMany({ where: { active: true, mandatory: true } });
    const where: any = { employee: { isNot: null } };
    if (department) where.employee = { department: { contains: department, mode: 'insensitive' } };

   const users = await this.prisma.user.findMany({ where, select: { id: true, fullName: true } });

    const submissions = await this.prisma.workDeclSubmission.findMany({
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
        userId:          u.id,
        name:       u.fullName,
        department: (u as any).employee?.department,
        completedForms,
        totalForms:      forms.length,
        complianceRate:  forms.length > 0 ? +((completedForms / forms.length) * 100).toFixed(0) : 0,
        pending:         forms.filter(f => !submitted.has(`${u.id}:${f.id}`)).map(f => f.title),
      };
    });

    const overallRate = report.length > 0
      ? +(report.reduce((a, r) => a + r.complianceRate, 0) / report.length).toFixed(1)
      : 0;

    return { overallRate, report: report.sort((a, b) => a.complianceRate - b.complianceRate) };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async notifyUser(userId: number, type: string, message: string) {
    try { await this.prisma.notificationLog.create({ data: { userId, type, message, success: true } }); } catch {}
  }

  private async notifyRH(type: string, message: string) {
    try {
     const hr = await this.prisma.user.findFirst({ where: { roleCode: 'RH' } as any });
      if (hr) await this.prisma.notificationLog.create({ data: { userId: hr.id, type, message, success: true } });
    } catch {}
  }

  // ── Auto-trigger (chamado por outros módulos) ─────────────────────────────

  async triggerOnboarding(userId: number) {
    const forms = await this.prisma.workDeclForm.findMany({
      where: { type: WorkDeclType.ONBOARDING, active: true },
    });
    // Criar submissões em estado DRAFT para o utilizador preencher
    await this.prisma.workDeclSubmission.createMany({
      data: forms.map(f => ({ userId, formId: f.id, status: WorkDeclStatus.PENDING })),
      skipDuplicates: true,
    });
    for (const f of forms) {
      await this.notifyUser(userId, 'ONBOARDING_DECLARATION', `Complete a declaração de onboarding: "${f.title}"`);
    }
    return { triggered: forms.length };
  }

  async triggerPeriodic() {
    const today = new Date();
    const forms = await this.prisma.workDeclForm.findMany({
      where: { type: WorkDeclType.PERIODIC, active: true, periodicity: 'ANNUAL' },
    });

    let triggered = 0;
    for (const form of forms) {
      const users = await this.prisma.user.findMany({ select: { id: true } });
      for (const user of users) {
        const thisYear = today.getFullYear().toString();
        const alreadyDone = await this.prisma.workDeclSubmission.findFirst({
          where: {
            userId: user.id, formId: form.id,
            createdAt: { gte: new Date(today.getFullYear(), 0, 1) },
            status: { in: [WorkDeclStatus.SUBMITTED, WorkDeclStatus.APPROVED] },
          },
        });
        if (!alreadyDone) {
          await this.notifyUser(user.id, 'PERIODIC_DECLARATION', `A declaração "${form.title}" requer actualização anual`);
          triggered++;
        }
      }
    }
    return { triggered };
  }
}