import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBeneficiaryDto,
  UpdateBeneficiaryDto,
  FilterBeneficiaryDto,
  CreateInteractionDto,
  CreateNeedDto,
  CreateBeneficiaryDocumentDto,
  ValidateBeneficiaryDocumentDto,
  CreateBenefitDto,
  UpdateBenefitDto,
  CreateParticipationDto,
  UpdateParticipationDto,
} from './dto';
import { AuditService } from '../common/services/audit.service';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

/** Campos do beneficiário que chegam como string ISO e são DateTime no schema. */
const BENEFICIARY_DATE_FIELDS = [
  'birthDate',
  'nextFollowUpAt',
  'idDocumentIssuedAt',
  'idDocumentExpiresAt',
  'registeredAt',
  'consentAt',
  'consentRevokedAt',
] as const;

const PARTICIPATION_DATE_FIELDS = ['enrolledAt', 'startDate', 'completedAt'] as const;

function toDates(dto: object, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...dto };
  for (const f of fields) {
    if (out[f]) out[f] = new Date(out[f] as string);
  }
  return out;
}

@Injectable()
export class CrmBeneficiariesService {
  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    const beneficiary = await this.prisma.beneficiary.create({
      data: {
        ...(toDates(dto, BENEFICIARY_DATE_FIELDS) as Prisma.BeneficiaryUncheckedCreateInput),
        code,
        createdById: userId,
        updatedById: userId,
      },
      include: {
        createdBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'Beneficiary', beneficiary.id, {
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
      segment,
      programName,
      municipality,
      priority,
      followUpStatus,
      page = 1,
      limit = 20,
    } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.BeneficiaryWhereInput = {
      deletedAt: null,
      ...(type && { type }),
      ...(status && { status }),
      ...(category && { category }),
      ...(province && { province }),
      ...(assignedToId && { assignedToId }),
      ...(segment && { segment }),
      ...(programName && { programName }),
      ...(municipality && { municipality }),
      ...(priority && { priority }),
      ...(followUpStatus && { followUpStatus }),
      ...(search && {
        OR: [
          { fullName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { nif: { contains: search } },
          { beneficiaryNumber: { contains: search, mode: 'insensitive' } },
          { idDocumentNumber: { contains: search } },
          { phone: { contains: search } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.read.beneficiary.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { fullName: true } },
          _count: { select: { interactions: true, needs: true } },
        },
      }),
      this.prisma.read.beneficiary.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    const beneficiary = await this.prisma.read.beneficiary.findUnique({
      where: { id },
      include: {
        createdBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true, email: true } },
        accountManager: { select: { fullName: true, email: true } },
        updatedBy: { select: { fullName: true } },
        benefits: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        participations: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        interactions: {
          where: { deletedAt: null },
          orderBy: { date: 'desc' },
          take: 20,
          include: {
            user: { select: { fullName: true } },
            relatedBeneficiary: { select: { id: true, fullName: true, code: true } },
          },
        },
        documents: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { validatedBy: { select: { fullName: true } } },
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
    const updated = await this.prisma.beneficiary.update({
      where: { id },
      data: {
        ...(toDates(dto, BENEFICIARY_DATE_FIELDS) as Prisma.BeneficiaryUncheckedUpdateInput),
        updatedById: userId,
        // Alterar o estado do consentimento regista a data se o cliente não a enviar.
        ...(dto.consentStatus === 'REVOKED' &&
          !dto.consentRevokedAt && { consentRevokedAt: new Date() }),
        ...(dto.consentStatus === 'GRANTED' && !dto.consentAt && { consentAt: new Date() }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'Beneficiary', id, dto);
    return updated;
  }

  async softDelete(id: string, userId: number) {
    await this.findOne(id);
    await this.prisma.beneficiary.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    await this.audit.logEntity(userId, 'DELETE', 'Beneficiary', id, {
      deletedAt: new Date(),
    });
    return { message: 'Beneficiário removido com sucesso' };
  }

  // ─── INTERACÇÕES ─────────────────────────────────────

  async addInteraction(beneficiaryId: string, dto: CreateInteractionDto, userId: number) {
    await this.findOne(beneficiaryId);
    if (dto.relatedBeneficiaryId) await this.findOne(dto.relatedBeneficiaryId);
    const interaction = await this.prisma.beneficiaryInteraction.create({
      data: {
        ...(toDates(dto, [
          'date',
          'nextActionDate',
        ]) as Prisma.BeneficiaryInteractionUncheckedCreateInput),
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
        ...(dto.nextActionDate && { nextFollowUpAt: new Date(dto.nextActionDate) }),
        satisfactionAvg: avgSatisfaction,
      },
    });

    await this.audit.logEntity(userId, 'CREATE', 'BeneficiaryInteraction', interaction.id, {
      beneficiaryId,
      type: dto.type,
    });
    return interaction;
  }

  async getInteractions(beneficiaryId: string, page = 1, limit = 20) {
    await this.findOne(beneficiaryId);
    const { skip, take } = calculatePagination(page, limit);
    const where = { beneficiaryId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.read.beneficiaryInteraction.findMany({
        where,
        skip,
        take,
        orderBy: { date: 'desc' },
        include: { user: { select: { fullName: true } } },
      }),
      this.prisma.read.beneficiaryInteraction.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  // ─── NECESSIDADES ────────────────────────────────────

  async addNeed(beneficiaryId: string, dto: CreateNeedDto, userId: number) {
    await this.findOne(beneficiaryId);
    const need = await this.prisma.beneficiaryNeed.create({
      data: { ...dto, beneficiaryId },
    });
    await this.audit.logEntity(userId, 'CREATE', 'BeneficiaryNeed', need.id, {
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
    await this.audit.logEntity(userId, 'UPDATE', 'BeneficiaryNeed', needId, {
      status: 'RESOLVED',
    });
    return updated;
  }

  // ─── DOCUMENTOS ──────────────────────────────────────

  async addDocument(beneficiaryId: string, dto: CreateBeneficiaryDocumentDto, userId: number) {
    await this.findOne(beneficiaryId);
    const doc = await this.prisma.beneficiaryDocument.create({
      data: {
        ...(toDates(dto, [
          'issuedAt',
          'expiresAt',
        ]) as Prisma.BeneficiaryDocumentUncheckedCreateInput),
        beneficiaryId,
        uploadedById: userId,
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'BeneficiaryDocument', doc.id, {
      beneficiaryId,
      type: dto.type,
    });
    return doc;
  }

  async validateDocument(docId: string, dto: ValidateBeneficiaryDocumentDto, userId: number) {
    const doc = await this.prisma.beneficiaryDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.deletedAt) throw new NotFoundException('Documento não encontrado');
    const updated = await this.prisma.beneficiaryDocument.update({
      where: { id: docId },
      data: {
        validationStatus: dto.validationStatus,
        isVerified: dto.validationStatus === 'VALID',
        validatedById: userId,
        validatedAt: new Date(),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'BeneficiaryDocument', docId, {
      beneficiaryId: doc.beneficiaryId,
      validationStatus: dto.validationStatus,
    });
    return updated;
  }

  async removeDocument(docId: string, userId: number) {
    const doc = await this.prisma.beneficiaryDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.deletedAt) throw new NotFoundException('Documento não encontrado');
    await this.prisma.beneficiaryDocument.update({
      where: { id: docId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'BeneficiaryDocument', docId, {
      beneficiaryId: doc.beneficiaryId,
    });
    return { message: 'Documento removido com sucesso' };
  }

  // ─── BENEFÍCIOS / SERVIÇOS ───────────────────────────

  /** totalBenefits = soma dos apoios com valor, não pendentes nem apagados. */
  private async syncTotalBenefits(beneficiaryId: string) {
    const agg = await this.prisma.beneficiaryBenefit.aggregate({
      _sum: { amount: true },
      where: { beneficiaryId, deletedAt: null, status: { not: 'PENDING' } },
    });
    await this.prisma.beneficiary.update({
      where: { id: beneficiaryId },
      data: { totalBenefits: agg._sum.amount ?? 0 },
    });
  }

  async addBenefit(beneficiaryId: string, dto: CreateBenefitDto, userId: number) {
    await this.findOne(beneficiaryId);
    const benefit = await this.prisma.beneficiaryBenefit.create({
      data: {
        ...(toDates(dto, [
          'awardedAt',
          'startDate',
          'endDate',
        ]) as Prisma.BeneficiaryBenefitUncheckedCreateInput),
        beneficiaryId,
        createdById: userId,
      },
    });
    await this.syncTotalBenefits(beneficiaryId);
    await this.audit.logEntity(userId, 'CREATE', 'BeneficiaryBenefit', benefit.id, {
      beneficiaryId,
      kind: dto.kind,
    });
    return benefit;
  }

  async updateBenefit(benefitId: string, dto: UpdateBenefitDto, userId: number) {
    const existing = await this.prisma.beneficiaryBenefit.findUnique({ where: { id: benefitId } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Benefício não encontrado');
    const updated = await this.prisma.beneficiaryBenefit.update({
      where: { id: benefitId },
      data: toDates(dto, ['endDate']) as Prisma.BeneficiaryBenefitUncheckedUpdateInput,
    });
    await this.syncTotalBenefits(existing.beneficiaryId);
    await this.audit.logEntity(userId, 'UPDATE', 'BeneficiaryBenefit', benefitId, {
      beneficiaryId: existing.beneficiaryId,
      ...dto,
    });
    return updated;
  }

  async removeBenefit(benefitId: string, userId: number) {
    const existing = await this.prisma.beneficiaryBenefit.findUnique({ where: { id: benefitId } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Benefício não encontrado');
    await this.prisma.beneficiaryBenefit.update({
      where: { id: benefitId },
      data: { deletedAt: new Date() },
    });
    await this.syncTotalBenefits(existing.beneficiaryId);
    await this.audit.logEntity(userId, 'DELETE', 'BeneficiaryBenefit', benefitId, {
      beneficiaryId: existing.beneficiaryId,
    });
    return { message: 'Benefício removido com sucesso' };
  }

  // ─── PARTICIPAÇÕES (programas / formação) ────────────

  async addParticipation(beneficiaryId: string, dto: CreateParticipationDto, userId: number) {
    await this.findOne(beneficiaryId);
    const participation = await this.prisma.beneficiaryParticipation.create({
      data: {
        ...(toDates(
          dto,
          PARTICIPATION_DATE_FIELDS,
        ) as Prisma.BeneficiaryParticipationUncheckedCreateInput),
        beneficiaryId,
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'BeneficiaryParticipation', participation.id, {
      beneficiaryId,
      program: dto.program,
    });
    return participation;
  }

  async updateParticipation(id: string, dto: UpdateParticipationDto, userId: number) {
    const existing = await this.prisma.beneficiaryParticipation.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Participação não encontrada');
    const updated = await this.prisma.beneficiaryParticipation.update({
      where: { id },
      data: toDates(
        dto,
        PARTICIPATION_DATE_FIELDS,
      ) as Prisma.BeneficiaryParticipationUncheckedUpdateInput,
    });
    await this.audit.logEntity(userId, 'UPDATE', 'BeneficiaryParticipation', id, {
      beneficiaryId: existing.beneficiaryId,
    });
    return updated;
  }

  async removeParticipation(id: string, userId: number) {
    const existing = await this.prisma.beneficiaryParticipation.findUnique({ where: { id } });
    if (!existing || existing.deletedAt) throw new NotFoundException('Participação não encontrada');
    await this.prisma.beneficiaryParticipation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'BeneficiaryParticipation', id, {
      beneficiaryId: existing.beneficiaryId,
    });
    return { message: 'Participação removida com sucesso' };
  }

  // ─── HISTÓRICO / REGISTO DE ACTIVIDADES ──────────────

  /** AuditLog.entityId é Int, mas os ids de beneficiário são cuid — por isso
   *  o id vive em metadata (`entityId` / `beneficiaryId`), como escreve logEntity. */
  async getHistory(beneficiaryId: string, page = 1, limit = 20) {
    await this.findOne(beneficiaryId);
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.AuditLogWhereInput = {
      entity: { startsWith: 'Beneficiary' },
      OR: [
        { metadata: { contains: `"entityId":"${beneficiaryId}"` } },
        { metadata: { contains: `"beneficiaryId":"${beneficiaryId}"` } },
      ],
    };
    const [data, total] = await Promise.all([
      this.prisma.read.auditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          entity: true,
          metadata: true,
          createdAt: true,
          user: { select: { fullName: true } },
        },
      }),
      this.prisma.read.auditLog.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  // ─── FOLLOW-UPS ──────────────────────────────────────

  async getFollowUps(userId: number, days = 7) {
    const until = new Date();
    until.setDate(until.getDate() + Number(days));
    return this.prisma.read.beneficiary.findMany({
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
      this.prisma.read.beneficiary.count({ where: { deletedAt: null } }),
      this.prisma.read.beneficiary.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.read.beneficiary.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.read.beneficiary.groupBy({
        by: ['type'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.read.beneficiary.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.read.beneficiary.groupBy({
        by: ['province'],
        where: { deletedAt: null, province: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 10,
      }),
      this.prisma.read.beneficiary.count({
        where: {
          nextFollowUpAt: { lte: in30Days },
          status: 'ACTIVE',
          deletedAt: null,
        },
      }),
      this.prisma.read.beneficiaryInteraction.findMany({
        where: { deletedAt: null },
        orderBy: { date: 'desc' },
        take: 5,
        include: {
          beneficiary: { select: { fullName: true, code: true } },
          user: { select: { fullName: true } },
        },
      }),
      this.prisma.read.beneficiaryNeed.count({ where: { status: 'OPEN' } }),
      this.prisma.read.beneficiary.aggregate({
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
      this.prisma.read.beneficiary.count({ where }),
      this.prisma.read.beneficiary.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
      }),
      this.prisma.read.beneficiary.groupBy({
        by: ['province'],
        where: { ...where, province: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prisma.read.beneficiaryInteraction.count({
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
}
