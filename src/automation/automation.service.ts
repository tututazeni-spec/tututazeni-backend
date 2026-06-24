// src/automation/automation.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateRuleDto,
  UpdateRuleDto,
  TriggerEventDto,
  ExecutionFilterDto,
  TriggerType,
  ActionType,
  AutomationCategory,
} from './automation.dto';

// ─── Helpers ─────────────────────────────────────────────────────

function safeM(prisma: any, name: string) {
  return (
    prisma[name] ?? {
      findMany: async () => [],
      findFirst: async () => null,
      create: async (d: any) => d.data,
      update: async (d: any) => d.data,
      count: async () => 0,
      delete: async () => null,
    }
  );
}

function parseCondition(condition?: string | null): Record<string, any> {
  if (!condition) return {};
  try {
    return JSON.parse(condition);
  } catch {
    return {};
  }
}

function parseParams(params?: string | null): Record<string, any> {
  if (!params) return {};
  try {
    return JSON.parse(params);
  } catch {
    return {};
  }
}

// ─── Built-in default rules ──────────────────────────────────────

const DEFAULT_RULES: Omit<CreateRuleDto, never>[] = [
  {
    name: 'Parabéns de Aniversário',
    description:
      'Envia notificação de aniversário no dia do aniversário (requer campo dateOfBirth)',
    trigger: TriggerType.BIRTHDAY_TODAY,
    action: ActionType.SEND_NOTIFICATION,
    category: AutomationCategory.ENGAGEMENT,
    condition: '',
    actionParams: JSON.stringify({
      type: 'BIRTHDAY',
      message: 'Parabéns pelo teu aniversário! 🎂',
    }),
    active: true,
    priority: 10,
  },
  {
    name: 'Lembrete de Formação em Atraso',
    description: 'Notifica colaboradores com formações em progresso há mais de 14 dias',
    trigger: TriggerType.ENROLLMENT_EXPIRING,
    action: ActionType.SEND_NOTIFICATION,
    category: AutomationCategory.LMS,
    condition: '',
    actionParams: JSON.stringify({
      type: 'ENROLLMENT_REMINDER',
      message: 'Tens formações por concluir!',
    }),
    active: true,
    priority: 20,
  },
  {
    name: 'Verificação de Recibos Pendentes',
    description: 'Alerta RH no dia 25 sobre recibos por emitir',
    trigger: TriggerType.PAYSLIP_DUE,
    action: ActionType.NOTIFY_HR,
    category: AutomationCategory.OPERATIONAL,
    condition: '',
    actionParams: JSON.stringify({ type: 'PAYSLIP_REMINDER', notifyRole: 'RH' }),
    active: true,
    priority: 30,
  },
  {
    name: 'PDI automático pós-avaliação excelente',
    description: 'Cria PDI sugerido quando score de avaliação ≥ 4.5',
    trigger: TriggerType.EVALUATION_SUBMITTED,
    action: ActionType.CREATE_PDI,
    category: AutomationCategory.PERFORMANCE,
    condition: JSON.stringify({ minScore: 4.5 }),
    actionParams: JSON.stringify({ name: 'PDI Aceleração — High Performer', status: 'DRAFT' }),
    active: true,
    priority: 40,
  },
  {
    name: 'Badge por conclusão de curso',
    description: 'Atribui badge ao concluir um curso com score ≥ 80',
    trigger: TriggerType.COURSE_COMPLETED,
    action: ActionType.AWARD_BADGE,
    category: AutomationCategory.GAMIFICATION,
    condition: JSON.stringify({ minScore: 80 }),
    actionParams: JSON.stringify({ badgeCode: 'COURSE_COMPLETE' }),
    active: true,
    priority: 50,
  },
  {
    name: 'Pontos por conclusão de curso',
    description: 'Atribui 50 XP ao concluir qualquer curso',
    trigger: TriggerType.COURSE_COMPLETED,
    action: ActionType.AWARD_POINTS,
    category: AutomationCategory.GAMIFICATION,
    condition: '',
    actionParams: JSON.stringify({ points: 50 }),
    active: true,
    priority: 55,
  },
  {
    name: 'Notificação de novo colaborador',
    description: 'Envia boas-vindas e atribui curso de onboarding ao criar utilizador',
    trigger: TriggerType.EMPLOYEE_CREATED,
    action: ActionType.SEND_NOTIFICATION,
    category: AutomationCategory.HR,
    condition: '',
    actionParams: JSON.stringify({ type: 'WELCOME', message: 'Bem-vindo à INNOVA! 🚀' }),
    active: true,
    priority: 60,
  },
];

// ─────────────────────────────────────────────────────────────────
// SERVICE
// ─────────────────────────────────────────────────────────────────

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ══════════════════════════════════════════════════════
  // RULES — CRUD
  // ══════════════════════════════════════════════════════

  async getRules(category?: AutomationCategory) {
    const where: any = {};
    if (category) where.category = category;

    const rules = await this.prisma.read.automationRule.findMany({
      where,
      orderBy: [{ active: 'desc' }, { priority: 'asc' }, { name: 'asc' }],
    });

    // Enrich with execution stats
    return Promise.all(
      rules.map(async r => {
        const [total, success, failed] = await Promise.all([
          safeM(this.prisma, 'automationExecution').count({ where: { ruleId: r.id } }),
          safeM(this.prisma, 'automationExecution').count({
            where: { ruleId: r.id, status: 'SUCCESS' },
          }),
          safeM(this.prisma, 'automationExecution').count({
            where: { ruleId: r.id, status: 'FAILED' },
          }),
        ]);
        return {
          ...r,
          condition: parseCondition(r.condition),
          actionParams: parseParams((r as any).actionParams),
          stats: {
            total,
            success,
            failed,
            successRate: total > 0 ? +((success / total) * 100).toFixed(1) : 0,
          },
        };
      }),
    );
  }

  async getRule(id: number) {
    const r = await this.prisma.read.automationRule.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Regra não encontrada');
    return r;
  }

  async createRule(dto: CreateRuleDto) {
    const rule = await this.prisma.automationRule.create({
      data: {
        name: dto.name,
        trigger: dto.trigger,
        action: dto.action,
        condition: dto.condition ?? '',
        active: dto.active ?? true,
        // Extra fields stored in condition JSON if model doesn't have columns
        ...(dto.description && ({ description: dto.description } as any)),
        ...(dto.category && ({ category: dto.category } as any)),
        ...(dto.priority && ({ priority: dto.priority } as any)),
        ...(dto.actionParams && ({ actionParams: dto.actionParams } as any)),
        ...(dto.maxRetries !== undefined && ({ maxRetries: dto.maxRetries } as any)),
      },
    });

    await this.prisma.auditLog
      .create({
        data: {
          userId: 0,
          action: 'AUTOMATION_RULE_CREATED',
          entity: 'AutomationRule',
          entityId: rule.id,
          changes: JSON.stringify({ name: dto.name, trigger: dto.trigger, action: dto.action }),
        },
      })
      .catch(() => {});

    return rule;
  }

  async updateRule(id: number, dto: UpdateRuleDto) {
    await this.getRule(id);
    return this.prisma.automationRule.update({ where: { id }, data: dto as any });
  }

  async toggleRule(id: number) {
    const r = await this.prisma.read.automationRule.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Regra não encontrada');
    return this.prisma.automationRule.update({ where: { id }, data: { active: !r.active } });
  }

  async deleteRule(id: number) {
    await this.getRule(id);
    await this.prisma.automationRule.delete({ where: { id } });
    return { message: 'Regra removida' };
  }

  async cloneRule(id: number) {
    const source = await this.getRule(id);
    return this.prisma.automationRule.create({
      data: { ...(source as any), id: undefined, name: `Cópia de: ${source.name}`, active: false },
    });
  }

  // ══════════════════════════════════════════════════════
  // EVENT TRIGGER — dispatch automations
  // ══════════════════════════════════════════════════════

  async triggerEvent(dto: TriggerEventDto) {
    // Find active rules matching this event trigger
    const rules = await this.prisma.read.automationRule.findMany({
      where: { active: true, trigger: dto.event },
      orderBy: { priority: 'asc' },
    });

    if (!rules.length) return { triggered: 0, message: 'Sem automações para este evento' };

    const results = [];
    for (const rule of rules) {
      const cond = parseCondition(rule.condition);
      if (!this.evaluateCondition(cond, dto.payload ?? {})) {
        results.push({
          ruleId: rule.id,
          name: rule.name,
          status: 'SKIPPED',
          reason: 'Condição não satisfeita',
        });
        continue;
      }
      const execResult = await this.executeAction(rule, dto.payload ?? {}, dto.userId);
      results.push({ ruleId: rule.id, name: rule.name, ...execResult });
    }

    return {
      triggered: results.filter(r => r.status !== 'SKIPPED').length,
      total: rules.length,
      results,
    };
  }

  // ══════════════════════════════════════════════════════
  // RUN ALL ACTIVE RULES (manual / scheduled)
  // ══════════════════════════════════════════════════════

  async runAllActiveRules() {
    const rules = await this.prisma.read.automationRule.findMany({ where: { active: true } });
    const results = [];

    for (const rule of rules) {
      try {
        const result = await this.executeRule(rule);
        results.push({ ruleId: rule.id, name: rule.name, success: true, ...result });
      } catch (e: any) {
        results.push({ ruleId: rule.id, name: rule.name, success: false, error: e.message });
        this.logger.error(`Rule ${rule.id} failed: ${e.message}`);
      }
    }

    return { executed: rules.length, results };
  }

  private async executeRule(rule: any): Promise<any> {
    switch (rule.trigger) {
      case TriggerType.BIRTHDAY_TODAY:
      case 'BIRTHDAY_TODAY':
        return this.processBirthdays();
      case TriggerType.ENROLLMENT_EXPIRING:
      case 'ENROLLMENT_EXPIRING':
        return this.sendEnrollmentReminders();
      case TriggerType.PAYSLIP_DUE:
      case 'PAYSLIP_DUE':
        return this.checkPayslipDue();
      case 'PENDING_LEAVE_3_DAYS':
        return this.sendLeaveReminders();
      default:
        return { message: `Trigger "${rule.trigger}" executado` };
    }
  }

  // ══════════════════════════════════════════════════════
  // ACTION EXECUTOR
  // ══════════════════════════════════════════════════════

  private async executeAction(
    rule: any,
    payload: Record<string, any>,
    userId?: number,
  ): Promise<{
    status: string;
    affected?: number;
    message?: string;
  }> {
    const params = parseParams(rule.actionParams);
    const targetUserId = userId ?? payload.userId;

    const execId = await safeM(this.prisma, 'automationExecution')
      .create({
        data: {
          ruleId: rule.id,
          status: 'RUNNING',
          payload: JSON.stringify(payload),
          startedAt: new Date(),
        },
      })
      .then((e: any) => e.id)
      .catch(() => null);

    try {
      let result: any;

      switch (rule.action) {
        case ActionType.SEND_NOTIFICATION: {
          if (targetUserId) {
            await this.prisma.notificationLog.create({
              data: {
                userId: targetUserId,
                type: params.type ?? 'AUTOMATION',
                message: params.message ?? `Automação: ${rule.name}`,
                metadata: JSON.stringify({ ruleId: rule.id, ...params }),
              },
            });
          }
          result = { affected: targetUserId ? 1 : 0 };
          break;
        }

        case ActionType.ASSIGN_COURSE: {
          if (targetUserId && params.courseId) {
            await this.prisma.enrollment
              .create({
                data: {
                  userId: targetUserId,
                  courseId: params.courseId,
                  status: 'EM_ANDAMENTO',
                  enrolledAt: new Date(),
                },
              })
              .catch(() => null);
            result = { affected: 1 };
          } else result = { affected: 0, message: 'courseId ou userId em falta' };
          break;
        }

        case ActionType.CREATE_PDI: {
          if (targetUserId) {
            await this.prisma.developmentPlan
              .create({
                data: {
                  userId: targetUserId,
                  name: params.name ?? `PDI Automático — ${rule.name}`,
                  status: params.status ?? 'DRAFT',
                  isTemplate: false,
                  goal: params.goal ?? 'Gerado automaticamente por automação',
                },
              })
              .catch(() => null);
            result = { affected: 1 };
          } else result = { affected: 0 };
          break;
        }

        case ActionType.AWARD_POINTS: {
          if (targetUserId && params.points) {
            await this.prisma.userPoints.upsert({
              where: { userId: targetUserId },
              create: { userId: targetUserId, points: params.points },
              update: { points: { increment: params.points } },
            });
            result = { affected: 1, points: params.points };
          } else result = { affected: 0 };
          break;
        }

        case ActionType.AWARD_BADGE: {
          if (targetUserId && params.badgeCode) {
            const badge = await this.prisma.badge
              .findFirst({ where: { code: params.badgeCode } as any })
              .catch(() => null);
            if (badge) {
              await this.prisma.badgeAward
                .create({ data: { userId: targetUserId, badgeId: badge.id } })
                .catch(() => null);
            }
            result = { affected: badge ? 1 : 0 };
          } else result = { affected: 0 };
          break;
        }

        case ActionType.LOG: {
          this.logger.log(
            `[AutomationLog] Rule ${rule.id}: ${params.message ?? JSON.stringify(payload)}`,
          );
          result = { affected: 0, logged: true };
          break;
        }

        case ActionType.WEBHOOK:
        case ActionType.HTTP_REQUEST: {
          if (params.url) {
            const res = await fetch(params.url, {
              method: params.method ?? 'POST',
              headers: { 'Content-Type': 'application/json', ...(params.headers ?? {}) },
              body: JSON.stringify({ event: rule.trigger, payload, ruleId: rule.id }),
              signal: AbortSignal.timeout(10000),
            }).catch(() => null);
            result = { affected: 0, httpStatus: res?.status };
          } else result = { affected: 0, error: 'URL em falta nos actionParams' };
          break;
        }

        case ActionType.NOTIFY_MANAGER:
        case ActionType.NOTIFY_HR: {
          const roleCode = rule.action === ActionType.NOTIFY_HR ? 'RH' : undefined;
          const managers = roleCode
            ? await this.prisma.read.user.findMany({
                where: { role: { code: roleCode } },
                select: { id: true },
                take: 20,
              })
            : targetUserId
              ? await this.prisma.user
                  .findMany({ where: { id: targetUserId }, select: { managerId: true } })
                  .then(us => us.map(u => ({ id: u.managerId })).filter(u => u.id))
              : [];
          for (const m of managers as any[]) {
            if (m.id)
              await this.prisma.notificationLog
                .create({
                  data: {
                    userId: m.id,
                    type: 'AUTOMATION_ALERT',
                    message: params.message ?? rule.name,
                    metadata: JSON.stringify({}),
                  },
                })
                .catch(() => {});
          }
          result = { affected: managers.length };
          break;
        }

        default: {
          result = { affected: 0, message: `Acção "${rule.action}" não implementada` };
        }
      }

      // Update execution as SUCCESS
      if (execId)
        await safeM(this.prisma, 'automationExecution')
          .update({
            where: { id: execId },
            data: { status: 'SUCCESS', result: JSON.stringify(result), completedAt: new Date() },
          })
          .catch(() => {});

      return { status: 'SUCCESS', ...result };
    } catch (err: any) {
      if (execId)
        await safeM(this.prisma, 'automationExecution')
          .update({
            where: { id: execId },
            data: {
              status: 'FAILED',
              error: err instanceof Error ? err.message : String(err),
              completedAt: new Date(),
            },
          })
          .catch(() => {});
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════
  // BUILT-IN RULE EXECUTORS
  // ══════════════════════════════════════════════════════

  private async processBirthdays(): Promise<any> {
    // dateOfBirth not in base schema — if added, filter here
    this.logger.warn(
      'processBirthdays: campo dateOfBirth não existe no modelo User — adiciona ao schema para activar',
    );
    return { birthdaysNotified: 0, message: 'Requer campo dateOfBirth no modelo User' };
  }

  private async sendLeaveReminders(): Promise<any> {
    // leaveRequest model doesn't exist → fallback to HistoryRecord
    const pending = await this.prisma.historyRecord
      .count({
        where: { action: 'LEAVE_REQUEST', description: { contains: '"status":"PENDING"' } },
      })
      .catch(() => 0);
    return { pending, message: `${pending} pedido(s) de ausência pendentes` };
  }

  private async sendEnrollmentReminders(): Promise<any> {
    const cutoff = new Date(Date.now() - 14 * 86400000);
    const enrollments = await this.prisma.read.enrollment.findMany({
      where: { status: 'EM_ANDAMENTO', enrolledAt: { lte: cutoff } },
      include: {
        user: { select: { id: true, fullName: true } },
        course: { select: { title: true } },
      },
      take: 100,
    });

    let notified = 0;
    for (const e of enrollments) {
      await this.prisma.notificationLog
        .create({
          data: {
            userId: e.userId,
            type: 'ENROLLMENT_REMINDER',
            message: `O curso "${e.course.title}" está pendente há mais de 14 dias`,
            metadata: JSON.stringify({}),
          },
        })
        .catch(() => {});
      notified++;
    }
    return { notified };
  }

  private async checkPayslipDue(): Promise<any> {
    const today = new Date();
    if (today.getDate() !== 25) return { message: 'Não é dia 25 — verificação ignorada' };
    const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const drafted = await this.prisma.payslip
      .count({ where: { period, status: 'DRAFT' } })
      .catch(() => 0);
    if (drafted > 0) {
      const hrUsers = await this.prisma.read.user.findMany({
        where: { role: { code: 'RH' } },
        select: { id: true },
        take: 10,
      });
      for (const u of hrUsers) {
        await this.prisma.notificationLog
          .create({
            data: {
              userId: u.id,
              type: 'PAYSLIP_REMINDER',
              message: `${drafted} recibo(s) por emitir para o período ${period}`,
              metadata: JSON.stringify({}),
            },
          })
          .catch(() => {});
      }
    }
    return { period, drafted, message: `${drafted} recibos por emitir` };
  }

  // ══════════════════════════════════════════════════════
  // CONDITION EVALUATOR
  // ══════════════════════════════════════════════════════

  private evaluateCondition(condition: Record<string, any>, payload: Record<string, any>): boolean {
    if (!Object.keys(condition).length) return true;

    for (const [key, value] of Object.entries(condition)) {
      const payloadVal = payload[key];
      if (key === 'minScore' && typeof payloadVal === 'number' && payloadVal < value) return false;
      if (key === 'maxScore' && typeof payloadVal === 'number' && payloadVal > value) return false;
      if (key === 'departmentId' && payloadVal !== value) return false;
      if (key === 'roleCode' && payloadVal !== value) return false;
      if (key === 'equals' && payloadVal !== value) return false;
    }
    return true;
  }

  // ══════════════════════════════════════════════════════
  // EXECUTION LOGS
  // ══════════════════════════════════════════════════════

  async getExecutions(filters: ExecutionFilterDto = {}) {
    const { page = 1, limit = 30, status, ruleId, from, to } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (ruleId) where.ruleId = ruleId;
    if (from || to) {
      where.startedAt = {};
      if (from) where.startedAt.gte = new Date(from);
      if (to) where.startedAt.lte = new Date(to);
    }

    const executions = await safeM(this.prisma, 'automationExecution')
      .findMany({
        where,
        skip,
        take: limit,
        orderBy: { startedAt: 'desc' },
      })
      .catch(() => [] as any[]);

    const total = await safeM(this.prisma, 'automationExecution')
      .count({ where })
      .catch(() => 0);

    return { data: executions, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async rerunExecution(executionId: number) {
    const exec = await safeM(this.prisma, 'automationExecution')
      .findUnique({
        where: { id: executionId },
      })
      .catch(() => null);

    if (!exec) return { message: 'Execução não encontrada' };

    const rule = await this.prisma.automationRule
      .findUnique({ where: { id: exec.ruleId } })
      .catch(() => null);
    if (!rule) return { message: 'Regra não encontrada' };

    const payload = exec.payload ? JSON.parse(exec.payload) : {};
    return this.executeAction(rule, payload, payload.userId);
  }

  // ══════════════════════════════════════════════════════
  // STATS & DASHBOARD
  // ══════════════════════════════════════════════════════

  async getStats() {
    const [total, active, execTotal, execSuccess, execFailed] = await Promise.all([
      this.prisma.read.automationRule.count(),
      this.prisma.read.automationRule.count({ where: { active: true } }),
      safeM(this.prisma, 'automationExecution').count({}),
      safeM(this.prisma, 'automationExecution').count({ where: { status: 'SUCCESS' } }),
      safeM(this.prisma, 'automationExecution').count({ where: { status: 'FAILED' } }),
    ]);

    const successRate = execTotal > 0 ? +((execSuccess / execTotal) * 100).toFixed(1) : 0;

    const byCategory = await this.prisma.automationRule
      .groupBy({
        by: ['category' as any],
        _count: { id: true },
      })
      .catch(() => [] as any[]);

    const recentFails = await safeM(this.prisma, 'automationExecution')
      .findMany({
        where: { status: 'FAILED' },
        orderBy: { startedAt: 'desc' },
        take: 5,
      })
      .catch(() => [] as any[]);

    return {
      rules: { total, active, inactive: total - active },
      executions: { total: execTotal, success: execSuccess, failed: execFailed, successRate },
      byCategory: (byCategory as any[]).map((c: any) => ({
        category: c.category,
        count: c._count.id,
      })),
      recentFails,
      generatedAt: new Date(),
    };
  }

  // ══════════════════════════════════════════════════════
  // TEMPLATES
  // ══════════════════════════════════════════════════════

  async getTemplates() {
    return DEFAULT_RULES.map((r, i) => ({ id: `TPL_${i}`, ...r }));
  }

  async applyTemplate(templateIndex: number) {
    const tpl = DEFAULT_RULES[templateIndex];
    if (!tpl) return { message: 'Template não encontrado' };

    const exists = await this.prisma.automationRule.findFirst({ where: { name: tpl.name } });
    if (exists) return { message: 'Automação com este nome já existe', rule: exists };

    return this.createRule(tpl);
  }

  // ══════════════════════════════════════════════════════
  // INIT DEFAULTS (legacy compat)
  // ══════════════════════════════════════════════════════

  async initDefaultRules() {
    const created = [];
    for (const r of DEFAULT_RULES) {
      const exists = await this.prisma.automationRule.findFirst({ where: { name: r.name } });
      if (!exists) created.push(await this.createRule(r));
    }
    return {
      created: created.length,
      message: `${created.length} regra(s) criadas de ${DEFAULT_RULES.length} templates`,
    };
  }
}
