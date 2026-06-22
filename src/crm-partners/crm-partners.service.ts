import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePartnerDto,
  UpdatePartnerDto,
  FilterPartnerDto,
  CreatePartnerInteractionDto,
  CreateMilestoneDto,
} from './dto';

@Injectable()
export class CrmPartnersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   * Nota: leituras puras usam Promise.all (não $transaction), pois a extensão
   * de réplicas encaminha sempre $transaction para o primary.
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  // ─── CÓDIGO AUTO-GERADO ──────────────────────────────

  private async generateCode(): Promise<string> {
    const last = await this.prisma.partner.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('PAR-', ''), 10) + 1 : 1;
    return `PAR-${String(num).padStart(5, '0')}`;
  }

  // ─── CRUD PRINCIPAL ──────────────────────────────────

  async create(dto: CreatePartnerDto, userId: number) {
    const code = await this.generateCode();
    const { contractStart, contractEnd, nextReviewAt, ...rest } = dto;
    const partner = await this.prisma.partner.create({
      data: {
        ...rest,
        ...(contractStart && { contractStart: new Date(contractStart) }),
        ...(contractEnd && { contractEnd: new Date(contractEnd) }),
        ...(nextReviewAt && { nextReviewAt: new Date(nextReviewAt) }),
        code,
        createdById: userId,
      },
      include: {
        createdBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
      },
    });
    await this.audit(userId, 'CREATE', 'Partner', partner.id, {
      code,
      type: dto.type,
    });
    return partner;
  }

  async findAll(filters: FilterPartnerDto) {
    const { type, tier, status, search, assignedToId, page = 1, limit = 20 } = filters;
    const where: any = {
      deletedAt: null,
      ...(type && { type }),
      ...(tier && { tier }),
      ...(status && { status }),
      ...(assignedToId && { assignedToId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { nif: { contains: search } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prismaRead.partner.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { fullName: true } },
          _count: { select: { interactions: true, milestones: true } },
        },
      }),
      this.prismaRead.partner.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const partner = await this.prismaRead.partner.findUnique({
      where: { id },
      include: {
        createdBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true, email: true } },
        interactions: {
          where: { deletedAt: null },
          orderBy: { date: 'desc' },
          take: 20,
          include: { user: { select: { fullName: true } } },
        },
        milestones: {
          where: { deletedAt: null },
          orderBy: { dueDate: 'asc' },
          include: { createdBy: { select: { fullName: true } } },
        },
        _count: { select: { interactions: true } },
      },
    });
    if (!partner || partner.deletedAt) {
      throw new NotFoundException('Parceiro não encontrado');
    }
    return partner;
  }

  async update(id: string, dto: UpdatePartnerDto, userId: number) {
    await this.findOne(id);
    const { contractStart, contractEnd, nextReviewAt, ...rest } = dto;
    const updated = await this.prisma.partner.update({
      where: { id },
      data: {
        ...rest,
        ...(contractStart && { contractStart: new Date(contractStart) }),
        ...(contractEnd && { contractEnd: new Date(contractEnd) }),
        ...(nextReviewAt && { nextReviewAt: new Date(nextReviewAt) }),
      },
    });
    await this.audit(userId, 'UPDATE', 'Partner', id, dto);
    return updated;
  }

  async softDelete(id: string, userId: number) {
    await this.findOne(id);
    await this.prisma.partner.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    await this.audit(userId, 'DELETE', 'Partner', id, { deletedAt: new Date() });
    return { message: 'Parceiro removido com sucesso' };
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  async addInteraction(partnerId: string, dto: CreatePartnerInteractionDto, userId: number) {
    await this.findOne(partnerId);
    const { date, nextDate, ...rest } = dto;
    const interaction = await this.prisma.partnerInteraction.create({
      data: {
        ...rest,
        ...(date && { date: new Date(date) }),
        ...(nextDate && { nextDate: new Date(nextDate) }),
        partnerId,
        userId,
      },
      include: { user: { select: { fullName: true } } },
    });

    const allRatings = await this.prisma.partnerInteraction.findMany({
      where: { partnerId, satisfaction: { not: null }, deletedAt: null },
      select: { satisfaction: true },
    });
    const avg =
      allRatings.length > 0
        ? allRatings.reduce((s, i) => s + (i.satisfaction || 0), 0) / allRatings.length
        : 0;

    await this.prisma.partner.update({
      where: { id: partnerId },
      data: {
        lastContactAt: new Date(),
        satisfactionAvg: avg,
        ...(nextDate && { nextReviewAt: new Date(nextDate) }),
      },
    });
    await this.audit(userId, 'CREATE', 'PartnerInteraction', interaction.id, {
      partnerId,
      type: dto.type,
    });
    return interaction;
  }

  async getInteractions(partnerId: string, page = 1, limit = 20) {
    await this.findOne(partnerId);
    const where = { partnerId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prismaRead.partnerInteraction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { date: 'desc' },
        include: { user: { select: { fullName: true } } },
      }),
      this.prismaRead.partnerInteraction.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── MILESTONES ──────────────────────────────────────

  async addMilestone(partnerId: string, dto: CreateMilestoneDto, userId: number) {
    await this.findOne(partnerId);
    const { dueDate, ...rest } = dto;
    const milestone = await this.prisma.partnerMilestone.create({
      data: {
        ...rest,
        dueDate: new Date(dueDate),
        partnerId,
        createdById: userId,
      },
    });
    await this.audit(userId, 'CREATE', 'PartnerMilestone', milestone.id, {
      partnerId,
    });
    return milestone;
  }

  async completeMilestone(milestoneId: string, userId: number) {
    const milestone = await this.prisma.partnerMilestone.findUnique({
      where: { id: milestoneId },
    });
    if (!milestone) throw new NotFoundException('Milestone não encontrado');
    const updated = await this.prisma.partnerMilestone.update({
      where: { id: milestoneId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    await this.audit(userId, 'UPDATE', 'PartnerMilestone', milestoneId, {
      status: 'COMPLETED',
    });
    return updated;
  }

  async getOverdueMilestones() {
    return this.prismaRead.partnerMilestone.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { lt: new Date() },
        deletedAt: null,
      },
      include: {
        partner: { select: { name: true, code: true } },
        createdBy: { select: { fullName: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  // ─── CONTRATOS A EXPIRAR ─────────────────────────────

  async getExpiringContracts(days = 30) {
    const until = new Date();
    until.setDate(until.getDate() + Number(days));
    return this.prismaRead.partner.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        contractEnd: { lte: until, gte: new Date() },
      },
      select: {
        id: true,
        code: true,
        name: true,
        contractEnd: true,
        contractUrl: true,
        annualValue: true,
        currency: true,
        assignedTo: { select: { fullName: true, email: true } },
      },
      orderBy: { contractEnd: 'asc' },
    });
  }

  // ─── DASHBOARD E RELATÓRIOS ──────────────────────────

  async getDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const in30Days = new Date(now.getTime() + 30 * 86400000);

    const [
      total,
      newThisMonth,
      active,
      byType,
      byTier,
      byStatus,
      totalValue,
      expiringContracts,
      overdueMilestones,
      recentInteractions,
      avgSatisfaction,
    ] = await Promise.all([
      this.prismaRead.partner.count({ where: { deletedAt: null } }),
      this.prismaRead.partner.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prismaRead.partner.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prismaRead.partner.groupBy({
        by: ['type'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prismaRead.partner.groupBy({
        by: ['tier'],
        where: { deletedAt: null, status: 'ACTIVE' },
        _count: { id: true },
      }),
      this.prismaRead.partner.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prismaRead.partner.aggregate({
        _sum: { annualValue: true },
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prismaRead.partner.count({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          contractEnd: { lte: in30Days, gte: now },
        },
      }),
      this.prismaRead.partnerMilestone.count({
        where: {
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          dueDate: { lt: now },
          deletedAt: null,
        },
      }),
      this.prismaRead.partnerInteraction.findMany({
        where: { deletedAt: null },
        orderBy: { date: 'desc' },
        take: 5,
        include: {
          partner: { select: { name: true, code: true } },
          user: { select: { fullName: true } },
        },
      }),
      this.prismaRead.partner.aggregate({
        _avg: { satisfactionAvg: true },
        where: { deletedAt: null, satisfactionAvg: { gt: 0 } },
      }),
    ]);

    return {
      totals: {
        total,
        newThisMonth,
        active,
        totalValueAOA: totalValue._sum.annualValue || 0,
        expiringContracts,
        overdueMilestones,
      },
      satisfaction: avgSatisfaction._avg.satisfactionAvg || 0,
      distributions: { byType, byTier, byStatus },
      recentInteractions,
    };
  }

  async getReport(startDate: Date, endDate: Date) {
    const where = { createdAt: { gte: startDate, lte: endDate } };
    const [created, byType, byTier, totalValue, interactions, milestones] = await Promise.all([
      this.prismaRead.partner.count({ where }),
      this.prismaRead.partner.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
      }),
      this.prismaRead.partner.groupBy({
        by: ['tier'],
        where,
        _count: { id: true },
      }),
      this.prismaRead.partner.aggregate({
        _sum: { annualValue: true },
        where: { ...where, status: 'ACTIVE' },
      }),
      this.prismaRead.partnerInteraction.count({
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prismaRead.partnerMilestone.count({
        where: {
          status: 'COMPLETED',
          completedAt: { gte: startDate, lte: endDate },
        },
      }),
    ]);
    return {
      period: { start: startDate, end: endDate },
      created,
      byType,
      byTier,
      totalValue: totalValue._sum.annualValue || 0,
      interactions,
      milestonesCompleted: milestones,
    };
  }

  // ─── HELPER ──────────────────────────────────────────

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
