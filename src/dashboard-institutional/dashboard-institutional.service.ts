import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { SnapshotType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSnapshotDto, CreateWidgetDto, UpdateWidgetDto, FilterSnapshotDto } from './dto';
import { AuditService } from '../common/services/audit.service';
// Serviço de hash-chain (src/audit/) — desligado da actividade real da app
// (ver docs), mas `getStats()` conta directo a tabela AuditLog partilhada,
// por isso os totais aqui são reais mesmo sem a cadeia de hash.
import { AuditService as AuditLogStatsService } from '../audit/audit.service';
import { CacheService } from '../cache/cache.service';
import { DASHBOARD_CACHE_TTL } from '../cache/cache.constants';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { OnboardingService } from '../onboarding/onboarding.service';
import { EventsService } from '../events/events.service';
import { ProcessStandardService } from '../process-standard/process-standard.service';
import { LegacyDocumentDeclarationsService } from '../work-declaration/legacy-document-declarations.service';
import { AutomationService } from '../automation/automation.service';
import { ScalabilityService } from '../scalability/scalability.service';
import { MonitoringService } from '../monitoring/monitoring.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { DashboardPeriod } from '../dashboard/dashboard.dto';

@Injectable()
export class DashboardInstitutionalService {
  private readonly logger = new Logger(DashboardInstitutionalService.name);

  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cache: CacheService,
    private readonly onboardingService: OnboardingService,
    private readonly eventsService: EventsService,
    private readonly processStandardService: ProcessStandardService,
    private readonly declarationsService: LegacyDocumentDeclarationsService,
    private readonly auditStatsService: AuditLogStatsService,
    private readonly automationService: AutomationService,
    private readonly scalabilityService: ScalabilityService,
    private readonly monitoringService: MonitoringService,
    private readonly dashboardService: DashboardService,
  ) {}

  // ─── RESUMO EXECUTIVO ────────────────────────────────

  async getExecutiveSummary() {
    return this.cache.getOrSet(
      'dashboard:institutional:executive-summary',
      DASHBOARD_CACHE_TTL,
      async () => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);

        const [
          users,
          newUsersMonth,
          courses,
          activeEnrollments,
          completedThisYear,
          beneficiaries,
          partners,
          funders,
          totalFundingAgg,
          libraryItems,
          certificates,
          badgesIssued,
        ] = await this.prisma.$transaction([
          this.prisma.read.user.count({ where: { active: true } }),
          this.prisma.read.user.count({ where: { createdAt: { gte: startOfMonth } } }),
          this.prisma.read.course.count({ where: { status: 'PUBLISHED' } }),
          this.prisma.read.enrollment.count({ where: { status: 'IN_PROGRESS' } }),
          this.prisma.read.enrollment.count({
            where: { status: 'COMPLETED', completedAt: { gte: startOfYear } },
          }),
          this.prisma.read.beneficiary.count({
            where: { status: 'ACTIVE', deletedAt: null },
          }),
          this.prisma.read.partner.count({
            where: { status: 'ACTIVE', deletedAt: null },
          }),
          this.prisma.read.funder.count({
            where: { status: 'ACTIVE', deletedAt: null },
          }),
          this.prisma.read.fundingGrant.aggregate({
            _sum: { amount: true },
            where: { status: 'ACTIVE', deletedAt: null },
          }),
          this.prisma.read.libraryItem.count({ where: { deletedAt: null } }),
          // Fase F2: IssuedCertificate absorvido por Certificate. Restrito aos
          // certificados do módulo certification (legacyIssuedCertId != null) para
          // preservar a contagem histórica.
          this.prisma.read.certificate.count({
            where: { legacyIssuedCertId: { not: null }, deletedAt: null },
          }),
          // Fase F3: BadgeIssuance absorvido por BadgeAward.
          this.prisma.read.badgeAward.count({
            where: { deletedAt: null, isRevoked: false },
          }),
        ]);

        const totalFunding = totalFundingAgg?._sum?.amount || 0;
        const completionRate = users > 0 ? (completedThisYear / users) * 100 : 0;

        return {
          people: { total: users, newThisMonth: newUsersMonth },
          learning: {
            courses,
            activeEnrollments,
            completedThisYear,
            completionRate: Math.round(completionRate * 10) / 10,
          },
          crm: {
            beneficiaries,
            partners,
            funders,
            totalFunding,
          },
          knowledge: { libraryItems, certificates, badgesIssued },
        };
      },
    );
  }

  // ─── TENDÊNCIA DE CRESCIMENTO ────────────────────────

  async getGrowthTrend(months = 12) {
    const data: Array<{
      month: string;
      users: number;
      enrollments: number;
      completions: number;
    }> = [];
    for (let i = Number(months) - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const range = { gte: start, lte: end };

      const [users, enrollments, completions] = await this.prisma.$transaction([
        this.prisma.read.user.count({ where: { createdAt: range } }),
        this.prisma.read.enrollment.count({ where: { enrolledAt: range } }),
        this.prisma.read.enrollment.count({
          where: { status: 'COMPLETED', completedAt: range },
        }),
      ]);

      data.push({
        month: start.toLocaleDateString('pt-AO', {
          month: 'short',
          year: 'numeric',
        }),
        users,
        enrollments,
        completions,
      });
    }
    return data;
  }

  // ─── DISTRIBUIÇÃO GEOGRÁFICA ─────────────────────────

  async getGeographicDistribution() {
    const beneficiariesByProvince = await this.prisma.read.beneficiary.groupBy({
      by: ['province'],
      where: { deletedAt: null, province: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
    return { beneficiariesByProvince: beneficiariesByProvince || [] };
  }

  // ─── ALERTAS INSTITUCIONAIS ──────────────────────────

  async getAlerts() {
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 86400000);
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const [
      expiredCerts,
      overdueReports,
      followUps,
      expiringContracts,
      overdueMilestones,
      pendingApprovals,
    ] = await this.prisma.$transaction([
      this.prisma.read.certificate.count({
        where: {
          legacyIssuedCertId: { not: null },
          expiresAt: { lt: now },
          revoked: false,
          deletedAt: null,
        },
      }),
      this.prisma.read.funderReport.count({
        where: { dueDate: { lt: now }, status: { in: ['PENDING', 'REJECTED'] } },
      }),
      this.prisma.read.beneficiary.count({
        where: {
          nextFollowUpAt: { lte: in7Days },
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
      this.prisma.read.partner.count({
        where: {
          contractEnd: { lte: in30Days, gte: now },
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
      this.prisma.read.partnerMilestone.count({
        where: {
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          dueDate: { lt: now },
          deletedAt: null,
        },
      }),
      this.prisma.read.libraryItem.count({
        where: { isApproved: false, deletedAt: null },
      }),
    ]);

    return {
      critical: expiredCerts + overdueReports + overdueMilestones,
      warnings: expiringContracts + pendingApprovals,
      reminders: followUps,
      details: {
        expiredCerts,
        overdueReports,
        followUps,
        expiringContracts,
        overdueMilestones,
        pendingApprovals,
      },
    };
  }

  // ─── SNAPSHOTS (HISTÓRICO DE KPIs) ───────────────────

  async createSnapshot(dto: CreateSnapshotDto, userId: number) {
    // Guard de unicidade antes da escrita: força primary.
    const existing = await this.prisma.institutionalSnapshot.findUnique({
      where: { period_type: { period: dto.period, type: dto.type || 'MONTHLY' } },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`Snapshot para ${dto.period} já existe`);
    }

    const summary = await this.getExecutiveSummary();

    const snapshot = await this.prisma.institutionalSnapshot.create({
      data: {
        period: dto.period,
        type: dto.type || 'MONTHLY',
        notes: dto.notes,
        metrics: JSON.stringify(summary),
        totalUsers: summary.people.total,
        totalEnrollments: summary.learning.activeEnrollments,
        totalBeneficiaries: summary.crm.beneficiaries,
        totalFunding: summary.crm.totalFunding,
        totalCertificates: summary.knowledge.certificates,
        completionRate: summary.learning.completionRate,
        createdById: userId,
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'InstitutionalSnapshot', snapshot.id, {
      period: dto.period,
    });
    return snapshot;
  }

  async findAllSnapshots(filters: FilterSnapshotDto) {
    const { type, page = 1, limit = 12 } = filters;
    const where = { deletedAt: null, ...(type && { type }) };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.read.institutionalSnapshot.findMany({
        where,
        skip,
        take,
        orderBy: { period: 'desc' },
        include: { createdBy: { select: { fullName: true } } },
      }),
      this.prisma.read.institutionalSnapshot.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(data, total, page, limit);
    return { data: pageData, ...meta };
  }

  async compareSnapshots(period1: string, period2: string, type: string = SnapshotType.MONTHLY) {
    // `type` chega da query string sem validação de DTO (ver controller) — antes
    // disto era passado directo com `as any`, o que deixava um valor inválido
    // rebentar como erro de validação do Prisma (500) em vez de 400.
    if (!Object.values(SnapshotType).includes(type as SnapshotType)) {
      throw new BadRequestException(`Tipo de snapshot inválido: ${type}`);
    }
    const snapshotType = type as SnapshotType;

    const [s1, s2] = await this.prisma.$transaction([
      this.prisma.read.institutionalSnapshot.findUnique({
        where: { period_type: { period: period1, type: snapshotType } },
      }),
      this.prisma.read.institutionalSnapshot.findUnique({
        where: { period_type: { period: period2, type: snapshotType } },
      }),
    ]);
    if (!s1 || !s2) throw new NotFoundException('Um dos snapshots não existe');

    const delta = (a: number, b: number) => ({
      from: a,
      to: b,
      change: b - a,
      changePct: a > 0 ? Math.round(((b - a) / a) * 1000) / 10 : 0,
    });

    return {
      period1,
      period2,
      comparison: {
        users: delta(s1.totalUsers, s2.totalUsers),
        enrollments: delta(s1.totalEnrollments, s2.totalEnrollments),
        beneficiaries: delta(s1.totalBeneficiaries, s2.totalBeneficiaries),
        funding: delta(s1.totalFunding, s2.totalFunding),
        certificates: delta(s1.totalCertificates, s2.totalCertificates),
        completionRate: delta(s1.completionRate, s2.completionRate),
      },
    };
  }

  // ─── WIDGETS PERSONALIZADOS ──────────────────────────

  async createWidget(dto: CreateWidgetDto, userId: number) {
    const widget = await this.prisma.dashboardWidget.create({
      data: { ...dto, userId },
    });
    return widget;
  }

  async getMyWidgets(userId: number) {
    return this.prisma.read.dashboardWidget.findMany({
      where: { userId, deletedAt: null, isVisible: true },
      orderBy: { position: 'asc' },
    });
  }

  async updateWidget(id: string, dto: UpdateWidgetDto, userId: number) {
    const widget = await this.prisma.dashboardWidget.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!widget) throw new NotFoundException('Widget não encontrado');
    return this.prisma.dashboardWidget.update({ where: { id }, data: dto });
  }

  async deleteWidget(id: string, userId: number) {
    const widget = await this.prisma.dashboardWidget.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!widget) throw new NotFoundException('Widget não encontrado');
    await this.prisma.dashboardWidget.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { message: 'Widget removido com sucesso' };
  }

  // ─── EXECUTIVO (ponto único) ──────────────────────────
  // Página "Organização" do /dashboard passa a chamar só isto. Compõe, sem
  // duplicar, o que já existia em dois módulos separados:
  //  - DashboardService.getExecutiveDashboard(): headcount/learning/
  //    performance/engagement/development/talent/pending + departamentos +
  //    top conteúdos + insights + talentHealth + eNPS + topTalent + riscos
  //    (org-wide, RH/academia)
  //  - este serviço: people/learning/crm/knowledge (CRM+conhecimento,
  //    ausentes do lado RH), alertas institucionais, tendência de
  //    crescimento, distribuição geográfica e a visão cruzada de módulos
  //    (getModulesOverview) já acrescentada acima.
  // Nenhum dos dois lados foi apagado — continuam acessíveis directamente
  // (/dashboard/organization, /dashboard/executive, etc.) para quem já os
  // chamava; isto é só a composição que o frontend consome de um único sítio.

  async getExecutive(period?: DashboardPeriod) {
    const [organization, summary, growthTrend, geographic, alerts, modules] = await Promise.all([
      this.dashboardService.getExecutiveDashboard(period),
      this.getExecutiveSummary(),
      this.getGrowthTrend(6),
      this.getGeographicDistribution(),
      this.getAlerts(),
      this.getModulesOverview(),
    ]);

    return {
      organization,
      summary,
      growthTrend,
      geographic,
      alerts,
      modules,
    };
  }

  // ─── VISÃO CRUZADA DE MÓDULOS ────────────────────────
  // Reaproveita os dashboards/stats já existentes de outros módulos em vez
  // de duplicar as suas queries. Promise.allSettled porque nenhum destes
  // módulos é dono do resumo institucional — uma falha isolada (ex.: tenant
  // de escalabilidade por resolver) não pode derrubar o resto do painel.

  async getModulesOverview() {
    return this.cache.getOrSet(
      'dashboard:institutional:modules-overview',
      DASHBOARD_CACHE_TTL,
      async () => {
        const [
          onboarding,
          events,
          processes,
          declarations,
          auditStats,
          automation,
          platform,
          monitoring,
        ] = await Promise.allSettled([
          this.onboardingService.getDashboard(),
          this.eventsService.getStats(),
          this.processStandardService.getDashboard(),
          this.declarationsService.getDashboard(),
          this.auditStatsService.getStats(),
          this.automationService.getStats(),
          this.scalabilityService
            .resolveTenantId()
            .then(tenantId => this.scalabilityService.getDashboard(tenantId)),
          this.monitoringService.getDashboard(),
        ]);

        const results = {
          onboarding,
          events,
          processes,
          declarations,
          auditStats,
          automation,
          platform,
          monitoring,
        };
        for (const [name, r] of Object.entries(results)) {
          if (r.status === 'rejected') {
            this.logger.warn(
              `Falha ao agregar módulo '${name}' no dashboard institucional: ${
                r.reason instanceof Error ? r.reason.message : String(r.reason)
              }`,
            );
          }
        }

        const onb = onboarding.status === 'fulfilled' ? onboarding.value : null;
        const evt = events.status === 'fulfilled' ? events.value : null;
        const proc = processes.status === 'fulfilled' ? processes.value : null;
        const decl = declarations.status === 'fulfilled' ? declarations.value : null;
        const aud = auditStats.status === 'fulfilled' ? auditStats.value : null;
        const auto = automation.status === 'fulfilled' ? automation.value : null;
        const plat = platform.status === 'fulfilled' ? platform.value : null;
        const mon = monitoring.status === 'fulfilled' ? monitoring.value : null;

        return {
          onboarding: onb && {
            active:
              (onb.summary.byStatus?.IN_PROGRESS ?? 0) + (onb.summary.byStatus?.NOT_STARTED ?? 0),
            overdueTasks: onb.summary.overdueTasks,
            avgSurveyScore: onb.summary.avgSurveyScore,
          },
          events: evt && {
            total: evt.total,
            totalParticipants: evt.totalParticipants,
          },
          processes: proc && {
            active: proc.processes.active,
            inProgress: proc.instances.inProgress,
            overdueSteps: proc.compliance.overdueSteps,
          },
          declarations: decl && {
            pending: decl.pending,
            issued: decl.issued,
            total: decl.total,
          },
          audit: aud && {
            totalEvents: aud.totals.total,
            todayEvents: aud.totals.today,
            criticalEvents: aud.totals.critical,
          },
          automation: auto && {
            totalRules: auto.rules.total,
            activeRules: auto.rules.active,
            successRate: auto.executions.successRate,
          },
          platform: plat && {
            uptimePercent: plat.performanceSummary.uptimePercent,
            openAlerts: plat.alerts.open,
            criticalAlerts: plat.alerts.critical,
            integrationsWithErrors: plat.integrations.withErrors,
          },
          evaluationCycles: mon && {
            activeCycles: mon.evaluation.activeEvalCycles,
            pendingEvaluations: mon.evaluation.pendingEvaluations,
            completionRate: mon.evaluation.evaluationCompletionRate,
          },
        };
      },
    );
  }

  // ─── HELPER ──────────────────────────────────────────
}
