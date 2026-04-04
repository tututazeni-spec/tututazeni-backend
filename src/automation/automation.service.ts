import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);
  constructor(private prisma: PrismaService) {}

  async getRules() {
    return this.prisma.automationRule.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async createRule(data: {
    name: string;
    trigger: string;
    condition?: string;
    action: string;
    active?: boolean;
  }) {
    // FIX: condition é obrigatório no schema — usa string vazia como fallback
    return this.prisma.automationRule.create({
      data: { ...data, condition: data.condition ?? '' },
    });
  }

  async toggleRule(id: number) {
    const r = await this.prisma.automationRule.findUnique({ where: { id } });
    if (!r) return null;
    return this.prisma.automationRule.update({ where: { id }, data: { active: !r.active } });
  }

  async runAllActiveRules() {
    const rules = await this.prisma.automationRule.findMany({ where: { active: true } });
    const results = [];
    for (const rule of rules) {
      try {
        const result = await this.executeRule(rule);
        results.push({ ruleId: rule.id, name: rule.name, success: true, result });
      } catch (e: any) {
        results.push({ ruleId: rule.id, name: rule.name, success: false, error: e.message });
      }
    }
    return { executed: rules.length, results };
  }

  private async executeRule(rule: any) {
    switch (rule.trigger) {
      case 'BIRTHDAY_TODAY':       return this.processBirthdays();
      case 'PENDING_LEAVE_3_DAYS': return this.sendLeaveReminders();
      case 'ENROLLMENT_EXPIRING':  return this.checkExpiringEnrollments();
      case 'PAYSLIP_DUE':          return this.checkPayslipDue();
      default: return { message: `Trigger ${rule.trigger} executado` };
    }
  }

  private async processBirthdays() {
    // FIX: dateOfBirth não existe no modelo User — funcionalidade desactivada
    // Para activar: adicionar dateOfBirth DateTime? ao model User no schema.prisma
    this.logger.warn('processBirthdays: campo dateOfBirth não existe no modelo User. Adicione ao schema para activar.');
    return { birthdaysNotified: 0, message: 'Campo dateOfBirth em falta no schema User' };
  }

  private async sendLeaveReminders() {
    // FIX: leaveRequest não existe no schema — funcionalidade desactivada
    // Para activar: adicionar model LeaveRequest ao schema.prisma
    this.logger.warn('sendLeaveReminders: modelo LeaveRequest não existe no schema.');
    return { reminders: 0, message: 'Modelo LeaveRequest em falta no schema' };
  }

  private async checkExpiringEnrollments() {
    // FIX: Enrollment não tem dueDate nem status 'IN_PROGRESS' — usa EnrollmentStatus enum e campos existentes
    const expiring = await this.prisma.enrollment.findMany({
      where: {
        status: 'EM_ANDAMENTO', // EnrollmentStatus correcto do schema
      },
      include: {
        user:   { select: { id: true, fullName: true } },
        course: { select: { title: true } },            // FIX: include course para aceder a title
      },
      take: 50,
      orderBy: { enrolledAt: 'asc' },
    });
    for (const e of expiring) {
      await this.prisma.notificationLog.create({
        data: {
          userId:  e.userId,
          type:    'ENROLLMENT_EXPIRING',
          message: `O curso "${e.course.title}" está em andamento.`,
          success: true, // FIX: campo obrigatório no schema
        },
      });
    }
    return { notified: expiring.length };
  }

  private async checkPayslipDue() {
    const today = new Date();
    if (today.getDate() !== 25) return { message: 'Não é dia 25' };
    const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    // FIX: payslip existe no schema (modelo Payslip) — requer migrate após schema corrigido
    const drafted = await this.prisma.payslip.count({ where: { period, status: 'DRAFT' } });
    return { message: `Período ${period}: ${drafted} recibos por emitir` };
  }

  async initDefaultRules() {
    const rules = [
      {
        name:      'Parabéns de aniversário automático',
        trigger:   'BIRTHDAY_TODAY',
        action:    'SEND_BIRTHDAY_NOTIFICATION',
        condition: '', // FIX: condition obrigatório no schema
        active:    true,
      },
      {
        name:      'Lembrete de licença pendente (3 dias)',
        trigger:   'PENDING_LEAVE_3_DAYS',
        action:    'NOTIFY_MANAGER',
        condition: '', // FIX
        active:    true,
      },
      {
        name:      'Inscrição prestes a expirar',
        trigger:   'ENROLLMENT_EXPIRING',
        action:    'NOTIFY_LEARNER',
        condition: '', // FIX
        active:    true,
      },
      {
        name:      'Verificação de recibos pendentes',
        trigger:   'PAYSLIP_DUE',
        action:    'NOTIFY_HR',
        condition: '', // FIX
        active:    true,
      },
    ];
    const created = [];
    for (const r of rules) {
      const exists = await this.prisma.automationRule.findFirst({ where: { name: r.name } });
      if (!exists) created.push(await this.prisma.automationRule.create({ data: r }));
    }
    return { created: created.length, message: `${created.length} regras criadas` };
  }
}