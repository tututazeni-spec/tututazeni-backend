import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFunderDto,
  UpdateFunderDto,
  FilterFunderDto,
  CreateGrantDto,
  CreateDisbursementDto,
  CreateFunderInteractionDto,
  CreateFunderReportDto,
} from './dto';
import { AuditService } from '../common/services/audit.service';

const MS_PER_DAY = 86_400_000;
const DEFAULT_CURRENCY = 'AOA'; // moeda oficial: Kwanza angolano
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100; // tecto de paginação (alinhado com @Max(100) nos DTOs de filtro)

@Injectable()
export class CrmFundersService {
  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── CÓDIGO AUTO-GERADO ──────────────────────────────

  /**
   * Sequências Postgres dedicadas (migração `add_funder_code_sequences`).
   * `nextval` é atómico, por isso elimina a corrida do antigo "ler último +1"
   * sob concorrência (ex.: vários financiadores criados em simultâneo).
   * Os nomes são constantes internas — nunca vêm de input do utilizador.
   */
  private static readonly CODE_SEQUENCES: Record<'funder' | 'fundingGrant', string> = {
    funder: 'funder_code_seq',
    fundingGrant: 'funding_grant_code_seq',
  };

  private async generateCode(prefix: string, model: 'funder' | 'fundingGrant'): Promise<string> {
    const sequence = CrmFundersService.CODE_SEQUENCES[model];
    // Escrita (avança o contador) → tem de ir ao primary, nunca à réplica.
    const rows = await this.prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
      `SELECT nextval('${sequence}') AS nextval`,
    );
    return `${prefix}-${String(Number(rows[0].nextval)).padStart(5, '0')}`;
  }

  // ─── CRUD FINANCIADORES ──────────────────────────────

  async create(dto: CreateFunderDto, userId: number) {
    const code = await this.generateCode('FIN', 'funder');
    const { relationshipStart, nextReportDue, ...rest } = dto;
    const funder = await this.prisma.funder.create({
      data: {
        ...rest,
        ...(relationshipStart && {
          relationshipStart: new Date(relationshipStart),
        }),
        ...(nextReportDue && { nextReportDue: new Date(nextReportDue) }),
        code,
        createdById: userId,
      },
      include: {
        createdBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'Funder', funder.id, {
      code,
      type: dto.type,
    });
    return funder;
  }

  async findAll(filters: FilterFunderDto) {
    const { type, status, search, country, assignedToId, page = 1, limit = 20 } = filters;
    const where: any = {
      deletedAt: null,
      ...(type && { type }),
      ...(status && { status }),
      ...(country && { country }),
      ...(assignedToId && { assignedToId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.read.funder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { fullName: true } },
          _count: { select: { grants: true, interactions: true } },
        },
      }),
      this.prisma.read.funder.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const funder = await this.prisma.read.funder.findUnique({
      where: { id },
      include: {
        createdBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true, email: true } },
        grants: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            _count: { select: { disbursements: true } },
          },
        },
        interactions: {
          where: { deletedAt: null },
          orderBy: { date: 'desc' },
          take: 20,
          include: { user: { select: { fullName: true } } },
        },
        reports: {
          where: { deletedAt: null },
          orderBy: { dueDate: 'asc' },
        },
        _count: { select: { grants: true, interactions: true } },
      },
    });
    if (!funder || funder.deletedAt) throw new NotFoundException('Financiador não encontrado');
    return funder;
  }

  async update(id: string, dto: UpdateFunderDto, userId: number) {
    await this.findOne(id);
    const { relationshipStart, nextReportDue, ...rest } = dto;
    const updated = await this.prisma.funder.update({
      where: { id },
      data: {
        ...rest,
        ...(relationshipStart && {
          relationshipStart: new Date(relationshipStart),
        }),
        ...(nextReportDue && { nextReportDue: new Date(nextReportDue) }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'Funder', id, dto);
    return updated;
  }

  async softDelete(id: string, userId: number) {
    await this.findOne(id);
    await this.prisma.funder.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    await this.audit.logEntity(userId, 'DELETE', 'Funder', id, { deletedAt: new Date() });
    return { message: 'Financiador removido com sucesso' };
  }

  // ─── GRANTS (FINANCIAMENTOS) ─────────────────────────

  async createGrant(funderId: string, dto: CreateGrantDto, userId: number) {
    await this.findOne(funderId);
    const code = await this.generateCode('GRT', 'fundingGrant');
    const { startDate, endDate, nextReportDue, ...rest } = dto;
    const grant = await this.prisma.fundingGrant.create({
      data: {
        ...rest,
        startDate: new Date(startDate),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(nextReportDue && { nextReportDue: new Date(nextReportDue) }),
        funderId,
        code,
      },
    });
    await this.updateFunderTotals(funderId);
    await this.audit.logEntity(userId, 'CREATE', 'FundingGrant', grant.id, {
      funderId,
      code,
    });
    await this.notifyGrantCreated(grant, dto, userId);
    return grant;
  }

  /** Notificação de grant criado — efeito secundário separado de createGrant. */
  private notifyGrantCreated(
    grant: { id: string; title: string; funderId: string },
    dto: CreateGrantDto,
    userId: number,
  ) {
    const currency = dto.currency || DEFAULT_CURRENCY;
    return this.prisma.notificationLog.create({
      data: {
        userId,
        type: 'GRANT_CREATED',
        title: 'Novo financiamento registado',
        message: `Grant "${grant.title}" no valor de ${currency} ${dto.amount.toLocaleString('pt-AO')} criado.`,
        metadata: JSON.stringify({ grantId: grant.id, funderId: grant.funderId }),
      },
    });
  }

  async findGrants(funderId: string, page = 1, limit = 20) {
    await this.findOne(funderId);
    const where = { funderId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.read.fundingGrant.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { disbursements: true, reports: true } },
        },
      }),
      this.prisma.read.fundingGrant.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateGrantStatus(grantId: string, status: string, userId: number) {
    const grant = await this.prisma.fundingGrant.findUnique({
      where: { id: grantId },
    });
    if (!grant) throw new NotFoundException('Grant não encontrado');
    const updated = await this.prisma.fundingGrant.update({
      where: { id: grantId },
      data: { status: status as any },
    });
    await this.updateFunderTotals(grant.funderId);
    await this.audit.logEntity(userId, 'UPDATE', 'FundingGrant', grantId, { status });
    return updated;
  }

  // ─── DESEMBOLSOS ─────────────────────────────────────

  async addDisbursement(grantId: string, dto: CreateDisbursementDto, userId: number) {
    const grant = await this.prisma.fundingGrant.findUnique({
      where: { id: grantId },
    });
    if (!grant) throw new NotFoundException('Grant não encontrado');

    const totalDisbursed = grant.disbursed + dto.amount;
    if (totalDisbursed > grant.amount) {
      throw new BadRequestException(
        `Desembolso excede o valor total do grant (${grant.amount} ${grant.currency})`,
      );
    }

    const { receivedAt, ...rest } = dto;
    const disbursement = await this.prisma.grantDisbursement.create({
      data: {
        ...rest,
        receivedAt: new Date(receivedAt),
        grantId,
        createdById: userId,
      },
    });

    await this.prisma.fundingGrant.update({
      where: { id: grantId },
      data: { disbursed: totalDisbursed },
    });

    await this.updateFunderTotals(grant.funderId);
    await this.audit.logEntity(userId, 'CREATE', 'GrantDisbursement', disbursement.id, {
      grantId,
      amount: dto.amount,
    });
    return disbursement;
  }

  async getDisbursements(grantId: string, page = 1, limit = 20) {
    const where = { grantId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.read.grantDisbursement.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { receivedAt: 'desc' },
        include: { createdBy: { select: { fullName: true } } },
      }),
      this.prisma.read.grantDisbursement.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  async addInteraction(funderId: string, dto: CreateFunderInteractionDto, userId: number) {
    await this.findOne(funderId);
    const { date, nextDate, ...rest } = dto;
    const interaction = await this.prisma.funderInteraction.create({
      data: {
        ...rest,
        ...(date && { date: new Date(date) }),
        ...(nextDate && { nextDate: new Date(nextDate) }),
        funderId,
        userId,
      },
      include: { user: { select: { fullName: true } } },
    });

    const ratings = await this.prisma.funderInteraction.findMany({
      where: { funderId, satisfaction: { not: null }, deletedAt: null },
      select: { satisfaction: true },
    });
    const avg =
      ratings.length > 0
        ? ratings.reduce((s, r) => s + (r.satisfaction || 0), 0) / ratings.length
        : 0;

    await this.prisma.funder.update({
      where: { id: funderId },
      data: {
        lastContactAt: new Date(),
        satisfactionAvg: avg,
        ...(nextDate && { nextReportDue: new Date(nextDate) }),
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'FunderInteraction', interaction.id, {
      funderId,
    });
    return interaction;
  }

  // ─── RELATÓRIOS ──────────────────────────────────────

  async createReport(funderId: string, dto: CreateFunderReportDto, userId: number) {
    await this.findOne(funderId);
    const { dueDate, ...rest } = dto;
    const report = await this.prisma.funderReport.create({
      data: {
        ...rest,
        dueDate: new Date(dueDate),
        funderId,
        createdById: userId,
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'FunderReport', report.id, {
      funderId,
      period: dto.period,
    });
    return report;
  }

  async submitReport(reportId: string, fileUrl: string, userId: number) {
    const report = await this.prisma.funderReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Relatório não encontrado');
    const updated = await this.prisma.funderReport.update({
      where: { id: reportId },
      data: { status: 'SUBMITTED', submittedAt: new Date(), fileUrl },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'FunderReport', reportId, {
      status: 'SUBMITTED',
    });
    return updated;
  }

  async getOverdueReports(page = 1, limit = DEFAULT_PAGE_SIZE) {
    const safePage = Math.max(page, 1);
    const safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
    const where: any = {
      status: { in: ['PENDING', 'REJECTED'] },
      dueDate: { lt: new Date() },
      deletedAt: null,
    };
    const [data, total] = await Promise.all([
      this.prisma.read.funderReport.findMany({
        where,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        include: {
          funder: { select: { name: true, code: true, email: true } },
          grant: { select: { title: true, code: true } },
        },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.read.funderReport.count({ where }),
    ]);
    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  // ─── DASHBOARD ───────────────────────────────────────

  async getDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in30Days = new Date(now.getTime() + 30 * MS_PER_DAY);

    const [
      total,
      newThisMonth,
      active,
      byType,
      byStatus,
      totalCommitted,
      totalReceived,
      activeGrants,
      overdueReports,
      reportsThisMonth,
      recentDisbursements,
      recentInteractions,
    ] = await Promise.all([
      this.prisma.read.funder.count({ where: { deletedAt: null } }),
      this.prisma.read.funder.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.read.funder.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.read.funder.groupBy({
        by: ['type'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.read.funder.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.read.fundingGrant.aggregate({
        _sum: { amount: true },
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.read.fundingGrant.aggregate({
        _sum: { disbursed: true },
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.read.fundingGrant.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.read.funderReport.count({
        where: {
          status: { in: ['PENDING', 'REJECTED'] },
          dueDate: { lt: now },
        },
      }),
      this.prisma.read.funderReport.count({
        where: { dueDate: { lte: in30Days, gte: now }, status: 'PENDING' },
      }),
      this.prisma.read.grantDisbursement.findMany({
        where: { createdAt: { gte: startOfMonth }, deletedAt: null },
        orderBy: { receivedAt: 'desc' },
        take: 5,
        include: {
          grant: { select: { title: true, code: true } },
          createdBy: { select: { fullName: true } },
        },
      }),
      this.prisma.read.funderInteraction.findMany({
        where: { deletedAt: null },
        orderBy: { date: 'desc' },
        take: 5,
        include: {
          funder: { select: { name: true, code: true } },
          user: { select: { fullName: true } },
        },
      }),
    ]);

    const committed = totalCommitted._sum.amount || 0;
    const received = totalReceived._sum.disbursed || 0;

    return {
      totals: {
        total,
        newThisMonth,
        active,
        activeGrants,
        overdueReports,
        reportsThisMonth,
        totalCommitted: committed,
        totalReceived: received,
        totalPending: committed - received,
        executionRate: committed > 0 ? (received / committed) * 100 : 0,
      },
      distributions: { byType, byStatus },
      recentDisbursements,
      recentInteractions,
    };
  }

  async getReport(startDate: Date, endDate: Date) {
    const range = { gte: startDate, lte: endDate };
    const [created, byType, grantsCreated, totalDisbursed, reports] = await Promise.all([
      this.prisma.read.funder.count({ where: { createdAt: range } }),
      this.prisma.read.funder.groupBy({
        by: ['type'],
        where: { createdAt: range },
        _count: { id: true },
      }),
      this.prisma.read.fundingGrant.count({ where: { createdAt: range } }),
      this.prisma.read.grantDisbursement.aggregate({
        _sum: { amount: true },
        where: { receivedAt: range },
      }),
      this.prisma.read.funderReport.count({ where: { submittedAt: range } }),
    ]);
    return {
      period: { start: startDate, end: endDate },
      created,
      byType,
      grantsCreated,
      totalDisbursed: totalDisbursed._sum.amount || 0,
      reportsSubmitted: reports,
    };
  }

  // ─── HELPER PRIVADO ──────────────────────────────────

  private async updateFunderTotals(funderId: string) {
    // A base de dados soma as colunas (aggregate) em vez de trazer todas as
    // linhas para memória só para somar — custo constante, não O(nº grants).
    const { _sum } = await this.prisma.fundingGrant.aggregate({
      where: { funderId, deletedAt: null },
      _sum: { amount: true, disbursed: true },
    });
    const totalCommitted = _sum.amount ?? 0;
    const totalReceived = _sum.disbursed ?? 0;
    await this.prisma.funder.update({
      where: { id: funderId },
      data: {
        totalCommitted,
        totalReceived,
        totalPending: totalCommitted - totalReceived,
      },
    });
  }
}
