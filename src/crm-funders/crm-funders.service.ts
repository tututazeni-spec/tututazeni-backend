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

@Injectable()
export class CrmFundersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   * Nota: leituras puras usam Promise.all (não $transaction), pois a extensão
   * de réplicas encaminha sempre $transaction para o primary.
   */
  private get prismaRead(): any {
    return (this.prisma as any).db ?? this.prisma;
  }

  // ─── CÓDIGO AUTO-GERADO ──────────────────────────────

  private async generateCode(prefix: string, model: 'funder' | 'fundingGrant'): Promise<string> {
    const last = await (this.prisma[model] as any).findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace(`${prefix}-`, ''), 10) + 1 : 1;
    return `${prefix}-${String(num).padStart(5, '0')}`;
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
    await this.audit(userId, 'CREATE', 'Funder', funder.id, {
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
      this.prismaRead.funder.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { fullName: true } },
          _count: { select: { grants: true, interactions: true } },
        },
      }),
      this.prismaRead.funder.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const funder = await this.prismaRead.funder.findUnique({
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
    await this.audit(userId, 'UPDATE', 'Funder', id, dto);
    return updated;
  }

  async softDelete(id: string, userId: number) {
    await this.findOne(id);
    await this.prisma.funder.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    await this.audit(userId, 'DELETE', 'Funder', id, { deletedAt: new Date() });
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
    await this.audit(userId, 'CREATE', 'FundingGrant', grant.id, {
      funderId,
      code,
    });
    const currency = dto.currency || 'AOA';
    await this.prisma.notificationLog.create({
      data: {
        userId,
        type: 'GRANT_CREATED',
        title: 'Novo financiamento registado',
        message: `Grant "${grant.title}" no valor de ${currency} ${dto.amount.toLocaleString('pt-AO')} criado.`,
        metadata: JSON.stringify({ grantId: grant.id, funderId }),
      },
    });
    return grant;
  }

  async findGrants(funderId: string, page = 1, limit = 20) {
    await this.findOne(funderId);
    const where = { funderId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prismaRead.fundingGrant.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { disbursements: true, reports: true } },
        },
      }),
      this.prismaRead.fundingGrant.count({ where }),
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
    await this.audit(userId, 'UPDATE', 'FundingGrant', grantId, { status });
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
    await this.audit(userId, 'CREATE', 'GrantDisbursement', disbursement.id, {
      grantId,
      amount: dto.amount,
    });
    return disbursement;
  }

  async getDisbursements(grantId: string, page = 1, limit = 20) {
    const where = { grantId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prismaRead.grantDisbursement.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { receivedAt: 'desc' },
        include: { createdBy: { select: { fullName: true } } },
      }),
      this.prismaRead.grantDisbursement.count({ where }),
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
    await this.audit(userId, 'CREATE', 'FunderInteraction', interaction.id, {
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
    await this.audit(userId, 'CREATE', 'FunderReport', report.id, {
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
    await this.audit(userId, 'UPDATE', 'FunderReport', reportId, {
      status: 'SUBMITTED',
    });
    return updated;
  }

  async getOverdueReports() {
    return this.prismaRead.funderReport.findMany({
      where: {
        status: { in: ['PENDING', 'REJECTED'] },
        dueDate: { lt: new Date() },
        deletedAt: null,
      },
      include: {
        funder: { select: { name: true, code: true, email: true } },
        grant: { select: { title: true, code: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  // ─── DASHBOARD ───────────────────────────────────────

  async getDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in30Days = new Date(now.getTime() + 30 * 86400000);

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
      this.prismaRead.funder.count({ where: { deletedAt: null } }),
      this.prismaRead.funder.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prismaRead.funder.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prismaRead.funder.groupBy({
        by: ['type'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prismaRead.funder.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prismaRead.fundingGrant.aggregate({
        _sum: { amount: true },
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prismaRead.fundingGrant.aggregate({
        _sum: { disbursed: true },
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prismaRead.fundingGrant.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prismaRead.funderReport.count({
        where: {
          status: { in: ['PENDING', 'REJECTED'] },
          dueDate: { lt: now },
        },
      }),
      this.prismaRead.funderReport.count({
        where: { dueDate: { lte: in30Days, gte: now }, status: 'PENDING' },
      }),
      this.prismaRead.grantDisbursement.findMany({
        where: { createdAt: { gte: startOfMonth }, deletedAt: null },
        orderBy: { receivedAt: 'desc' },
        take: 5,
        include: {
          grant: { select: { title: true, code: true } },
          createdBy: { select: { fullName: true } },
        },
      }),
      this.prismaRead.funderInteraction.findMany({
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
      this.prismaRead.funder.count({ where: { createdAt: range } }),
      this.prismaRead.funder.groupBy({
        by: ['type'],
        where: { createdAt: range },
        _count: { id: true },
      }),
      this.prismaRead.fundingGrant.count({ where: { createdAt: range } }),
      this.prismaRead.grantDisbursement.aggregate({
        _sum: { amount: true },
        where: { receivedAt: range },
      }),
      this.prismaRead.funderReport.count({ where: { submittedAt: range } }),
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
    const grants = await this.prisma.fundingGrant.findMany({
      where: { funderId, deletedAt: null },
      select: { amount: true, disbursed: true, status: true },
    });
    const totalCommitted = grants.reduce((s, g) => s + g.amount, 0);
    const totalReceived = grants.reduce((s, g) => s + g.disbursed, 0);
    await this.prisma.funder.update({
      where: { id: funderId },
      data: {
        totalCommitted,
        totalReceived,
        totalPending: totalCommitted - totalReceived,
      },
    });
  }

  private async audit(userId: number, action: string, entity: string, entityId: string, meta: any) {
    // AuditLog.entityId é Int? no schema; os IDs do CRM são cuid (String),
    // por isso guardamos o id real dentro de metadata (sempre JSON.stringify).
    await this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        metadata: JSON.stringify({ ...meta, entityId }),
      },
    });
  }
}
