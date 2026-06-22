import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBeneficiaryDto,
  UpdateBeneficiaryDto,
  FilterBeneficiaryDto,
  CreateInteractionDto,
  CreateNeedDto,
} from './dto';

@Injectable()
export class CrmBeneficiariesService {
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

  // ─── GERAÇÃO DE CÓDIGO ───────────────────────────────

  private async generateCode(): Promise<string> {
    const last = await this.prisma.beneficiary.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('BEN-', ''), 10) + 1 : 1;
    return `BEN-${String(num).padStart(5, '0')}`;
  }

  // ─── CRUD PRINCIPAL ──────────────────────────────────

  async create(dto: CreateBeneficiaryDto, userId: number) {
    const code = await this.generateCode();
    const { birthDate, nextFollowUpAt, ...rest } = dto;
    const beneficiary = await this.prisma.beneficiary.create({
      data: {
        ...rest,
        ...(birthDate && { birthDate: new Date(birthDate) }),
        ...(nextFollowUpAt && { nextFollowUpAt: new Date(nextFollowUpAt) }),
        code,
        createdById: userId,
      },
      include: {
        createdBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
      },
    });
    await this.audit(userId, 'CREATE', 'Beneficiary', beneficiary.id, {
      code,
      type: dto.type,
    });
    return beneficiary;
  }

  async findAll(filters: FilterBeneficiaryDto) {
    const {
      type,
      status,
      category,
      province,
      search,
      assignedToId,
      page = 1,
      limit = 20,
    } = filters;
    const where: any = {
      deletedAt: null,
      ...(type && { type }),
      ...(status && { status }),
      ...(category && { category }),
      ...(province && { province }),
      ...(assignedToId && { assignedToId }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { nif: { contains: search } },
          { phone: { contains: search } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prismaRead.beneficiary.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { fullName: true } },
          _count: { select: { interactions: true, needs: true } },
        },
      }),
      this.prismaRead.beneficiary.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const beneficiary = await this.prismaRead.beneficiary.findUnique({
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
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        needs: {
          orderBy: { priority: 'asc' },
        },
        _count: { select: { interactions: true } },
      },
    });
    if (!beneficiary || beneficiary.deletedAt) {
      throw new NotFoundException('Beneficiário não encontrado');
    }
    return beneficiary;
  }

  async update(id: string, dto: UpdateBeneficiaryDto, userId: number) {
    await this.findOne(id);
    const { birthDate, nextFollowUpAt, ...rest } = dto;
    const updated = await this.prisma.beneficiary.update({
      where: { id },
      data: {
        ...rest,
        ...(birthDate && { birthDate: new Date(birthDate) }),
        ...(nextFollowUpAt && { nextFollowUpAt: new Date(nextFollowUpAt) }),
      },
    });
    await this.audit(userId, 'UPDATE', 'Beneficiary', id, dto);
    return updated;
  }

  async softDelete(id: string, userId: number) {
    await this.findOne(id);
    await this.prisma.beneficiary.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    await this.audit(userId, 'DELETE', 'Beneficiary', id, {
      deletedAt: new Date(),
    });
    return { message: 'Beneficiário removido com sucesso' };
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  async addInteraction(beneficiaryId: string, dto: CreateInteractionDto, userId: number) {
    await this.findOne(beneficiaryId);
    const { date, nextActionDate, ...rest } = dto;
    const interaction = await this.prisma.beneficiaryInteraction.create({
      data: {
        ...rest,
        ...(date && { date: new Date(date) }),
        ...(nextActionDate && { nextActionDate: new Date(nextActionDate) }),
        beneficiaryId,
        userId,
      },
      include: { user: { select: { fullName: true } } },
    });

    // Actualiza lastContactAt, nextFollowUpAt e satisfação média
    const allInteractions = await this.prisma.beneficiaryInteraction.findMany({
      where: { beneficiaryId, satisfaction: { not: null }, deletedAt: null },
      select: { satisfaction: true },
    });
    const avgSatisfaction =
      allInteractions.length > 0
        ? allInteractions.reduce((s, i) => s + (i.satisfaction || 0), 0) / allInteractions.length
        : 0;

    await this.prisma.beneficiary.update({
      where: { id: beneficiaryId },
      data: {
        lastContactAt: new Date(),
        ...(nextActionDate && { nextFollowUpAt: new Date(nextActionDate) }),
        satisfactionAvg: avgSatisfaction,
      },
    });

    await this.audit(userId, 'CREATE', 'BeneficiaryInteraction', interaction.id, {
      beneficiaryId,
      type: dto.type,
    });
    return interaction;
  }

  async getInteractions(beneficiaryId: string, page = 1, limit = 20) {
    await this.findOne(beneficiaryId);
    const where = { beneficiaryId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prismaRead.beneficiaryInteraction.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { date: 'desc' },
        include: { user: { select: { fullName: true } } },
      }),
      this.prismaRead.beneficiaryInteraction.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── NECESSIDADES ────────────────────────────────────

  async addNeed(beneficiaryId: string, dto: CreateNeedDto, userId: number) {
    await this.findOne(beneficiaryId);
    const need = await this.prisma.beneficiaryNeed.create({
      data: { ...dto, beneficiaryId },
    });
    await this.audit(userId, 'CREATE', 'BeneficiaryNeed', need.id, {
      beneficiaryId,
    });
    return need;
  }

  async resolveNeed(needId: string, userId: number) {
    const need = await this.prisma.beneficiaryNeed.findUnique({
      where: { id: needId },
    });
    if (!need) throw new NotFoundException('Necessidade não encontrada');
    const updated = await this.prisma.beneficiaryNeed.update({
      where: { id: needId },
      data: { status: 'RESOLVED', resolvedAt: new Date(), resolvedById: userId },
    });
    await this.audit(userId, 'UPDATE', 'BeneficiaryNeed', needId, {
      status: 'RESOLVED',
    });
    return updated;
  }

  // ─── FOLLOW-UPS ──────────────────────────────────────

  async getFollowUps(userId: number, days = 7) {
    const until = new Date();
    until.setDate(until.getDate() + Number(days));
    return this.prismaRead.beneficiary.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        nextFollowUpAt: { lte: until },
        OR: [{ assignedToId: userId }, { createdById: userId }],
      },
      orderBy: { nextFollowUpAt: 'asc' },
      select: {
        id: true,
        code: true,
        fullName: true,
        phone: true,
        email: true,
        nextFollowUpAt: true,
        assignedTo: { select: { fullName: true } },
        _count: { select: { interactions: true } },
      },
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
      byStatus,
      byProvince,
      pendingFollowUps,
      recentInteractions,
      openNeeds,
      avgSatisfaction,
    ] = await Promise.all([
      this.prismaRead.beneficiary.count({ where: { deletedAt: null } }),
      this.prismaRead.beneficiary.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prismaRead.beneficiary.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prismaRead.beneficiary.groupBy({
        by: ['type'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prismaRead.beneficiary.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prismaRead.beneficiary.groupBy({
        by: ['province'],
        where: { deletedAt: null, province: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      this.prismaRead.beneficiary.count({
        where: {
          nextFollowUpAt: { lte: in30Days },
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
      this.prismaRead.beneficiaryInteraction.findMany({
        where: { deletedAt: null },
        orderBy: { date: 'desc' },
        take: 5,
        include: {
          beneficiary: { select: { fullName: true, code: true } },
          user: { select: { fullName: true } },
        },
      }),
      this.prismaRead.beneficiaryNeed.count({ where: { status: 'OPEN' } }),
      this.prismaRead.beneficiary.aggregate({
        _avg: { satisfactionAvg: true },
        where: { deletedAt: null, satisfactionAvg: { gt: 0 } },
      }),
    ]);

    return {
      totals: { total, newThisMonth, active, pendingFollowUps, openNeeds },
      satisfaction: avgSatisfaction._avg.satisfactionAvg || 0,
      distributions: { byType, byStatus, byProvince },
      recentInteractions,
    };
  }

  async getReport(startDate: Date, endDate: Date) {
    const where = { createdAt: { gte: startDate, lte: endDate } };
    const [created, byType, byProvince, interactions] = await Promise.all([
      this.prismaRead.beneficiary.count({ where }),
      this.prismaRead.beneficiary.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
      }),
      this.prismaRead.beneficiary.groupBy({
        by: ['province'],
        where: { ...where, province: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prismaRead.beneficiaryInteraction.count({
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
    ]);
    return {
      period: { start: startDate, end: endDate },
      created,
      interactions,
      byType,
      byProvince,
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
