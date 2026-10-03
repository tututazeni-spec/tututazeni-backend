import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePartnerDto,
  UpdatePartnerDto,
  FilterPartnerDto,
  CreatePartnerInteractionDto,
  CreateMilestoneDto,
  CreatePartnerContactDto,
  UpdatePartnerContactDto,
  CreatePartnerProgramDto,
  UpdatePartnerProgramDto,
  CreatePartnerAgreementDto,
  UpdatePartnerAgreementDto,
  CreateAgreementVersionDto,
} from './dto';
import { AuditService } from '../common/services/audit.service';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

@Injectable()
export class CrmPartnersService {
  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    const { contractStart, contractEnd, nextReviewAt, registeredAt, contacts, ...rest } = dto;
    this.assertSinglePrimary(contacts);
    const partner = await this.prisma.partner.create({
      data: {
        ...rest,
        ...(registeredAt && { registeredAt: new Date(registeredAt) }),
        ...(contacts?.length && {
          contacts: { create: this.normalizeContacts(contacts) },
        }),
        ...(contractStart && { contractStart: new Date(contractStart) }),
        ...(contractEnd && { contractEnd: new Date(contractEnd) }),
        ...(nextReviewAt && { nextReviewAt: new Date(nextReviewAt) }),
        code,
        createdById: userId,
      },
      include: {
        createdBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true } },
        contacts: { where: { deletedAt: null }, orderBy: { isPrimary: 'desc' } },
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'Partner', partner.id, {
      code,
      type: dto.type,
    });
    return partner;
  }

  async findAll(filters: FilterPartnerDto) {
    const {
      type,
      tier,
      status,
      search,
      assignedToId,
      partnershipLevel,
      partnershipType,
      sector,
      category,
      tag,
      page = 1,
      limit = 20,
    } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.PartnerWhereInput = {
      deletedAt: null,
      ...(type && { type }),
      ...(tier && { tier }),
      ...(status && { status }),
      ...(assignedToId && { assignedToId }),
      ...(partnershipLevel && { partnershipLevel }),
      ...(partnershipType && { partnershipTypes: { has: partnershipType } }),
      ...(sector && { sector: { contains: sector, mode: 'insensitive' } }),
      ...(category && { category: { contains: category, mode: 'insensitive' } }),
      ...(tag && { tags: { has: tag } }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { commercialName: { contains: search, mode: 'insensitive' } },
          { registrationNumber: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { nif: { contains: search } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.read.partner.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { fullName: true } },
          _count: { select: { interactions: true, milestones: true } },
        },
      }),
      this.prisma.read.partner.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    const partner = await this.prisma.read.partner.findUnique({
      where: { id },
      include: {
        createdBy: { select: { fullName: true } },
        assignedTo: { select: { fullName: true, email: true } },
        contacts: {
          where: { deletedAt: null },
          orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
        },
        programs: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { responsible: { select: { fullName: true } } },
        },
        agreements: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            responsible: { select: { fullName: true } },
            versions: { orderBy: { version: 'desc' }, take: 1 },
          },
        },
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
    const { contractStart, contractEnd, nextReviewAt, registeredAt, ...rest } = dto;
    const updated = await this.prisma.partner.update({
      where: { id },
      data: {
        ...rest,
        ...(registeredAt && { registeredAt: new Date(registeredAt) }),
        ...(contractStart && { contractStart: new Date(contractStart) }),
        ...(contractEnd && { contractEnd: new Date(contractEnd) }),
        ...(nextReviewAt && { nextReviewAt: new Date(nextReviewAt) }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'Partner', id, dto);
    return updated;
  }

  async softDelete(id: string, userId: number) {
    await this.findOne(id);
    await this.prisma.partner.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INACTIVE' },
    });
    await this.audit.logEntity(userId, 'DELETE', 'Partner', id, { deletedAt: new Date() });
    return { message: 'Parceiro removido com sucesso' };
  }

  // ─── CONTACTOS ───────────────────────────────────────

  private assertSinglePrimary(contacts?: { isPrimary?: boolean }[]) {
    if (contacts && contacts.filter(c => c.isPrimary).length > 1) {
      throw new BadRequestException('Apenas um contacto pode ser principal');
    }
  }

  /** Se nenhum for marcado como principal, o primeiro da lista assume o papel. */
  private normalizeContacts(contacts: CreatePartnerContactDto[]) {
    const hasPrimary = contacts.some(c => c.isPrimary);
    return contacts.map((c, i) => ({ ...c, isPrimary: hasPrimary ? !!c.isPrimary : i === 0 }));
  }

  async getContacts(partnerId: string) {
    await this.findOne(partnerId);
    return this.prisma.read.partnerContact.findMany({
      where: { partnerId, deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
    });
  }

  private async findContact(partnerId: string, contactId: string) {
    const contact = await this.prisma.partnerContact.findFirst({
      where: { id: contactId, partnerId, deletedAt: null },
    });
    if (!contact) throw new NotFoundException('Contacto não encontrado');
    return contact;
  }

  async addContact(partnerId: string, dto: CreatePartnerContactDto, userId: number) {
    await this.findOne(partnerId);
    const contact = await this.prisma.$transaction(async tx => {
      const existing = await tx.partnerContact.count({ where: { partnerId, deletedAt: null } });
      // O primeiro contacto é sempre o principal
      const isPrimary = dto.isPrimary || existing === 0;
      if (isPrimary) {
        await tx.partnerContact.updateMany({
          where: { partnerId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.partnerContact.create({ data: { ...dto, isPrimary, partnerId } });
    });
    await this.audit.logEntity(userId, 'CREATE', 'PartnerContact', contact.id, { partnerId });
    return contact;
  }

  async updateContact(
    partnerId: string,
    contactId: string,
    dto: UpdatePartnerContactDto,
    userId: number,
  ) {
    const current = await this.findContact(partnerId, contactId);
    if (dto.isPrimary === false && current.isPrimary) {
      throw new BadRequestException(
        'Para mudar o contacto principal, marque outro contacto como principal',
      );
    }
    const updated = await this.prisma.$transaction(async tx => {
      if (dto.isPrimary) {
        await tx.partnerContact.updateMany({
          where: { partnerId, isPrimary: true, id: { not: contactId } },
          data: { isPrimary: false },
        });
      }
      return tx.partnerContact.update({ where: { id: contactId }, data: dto });
    });
    await this.audit.logEntity(userId, 'UPDATE', 'PartnerContact', contactId, dto);
    return updated;
  }

  async removeContact(partnerId: string, contactId: string, userId: number) {
    const current = await this.findContact(partnerId, contactId);
    await this.prisma.$transaction(async tx => {
      await tx.partnerContact.update({
        where: { id: contactId },
        data: { deletedAt: new Date(), isPrimary: false },
      });
      // Se removeu o principal, promove o contacto mais antigo restante
      if (current.isPrimary) {
        const next = await tx.partnerContact.findFirst({
          where: { partnerId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        });
        if (next) {
          await tx.partnerContact.update({ where: { id: next.id }, data: { isPrimary: true } });
        }
      }
    });
    await this.audit.logEntity(userId, 'DELETE', 'PartnerContact', contactId, { partnerId });
    return { message: 'Contacto removido com sucesso' };
  }

  // ─── PROGRAMAS E PROJECTOS (⑤) ───────────────────────

  private assertDateRange(start?: string | Date | null, end?: string | Date | null) {
    if (start && end && new Date(end) < new Date(start)) {
      throw new BadRequestException('A data de término não pode ser anterior à data de início');
    }
  }

  private async assertUserExists(id?: number) {
    if (id === undefined || id === null) return;
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new BadRequestException('Responsável interno não encontrado');
  }

  async getPrograms(partnerId: string) {
    await this.findOne(partnerId);
    return this.prisma.read.partnerProgram.findMany({
      where: { partnerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { responsible: { select: { fullName: true } } },
    });
  }

  private async findProgram(partnerId: string, programId: string) {
    const program = await this.prisma.partnerProgram.findFirst({
      where: { id: programId, partnerId, deletedAt: null },
    });
    if (!program) throw new NotFoundException('Programa do parceiro não encontrado');
    return program;
  }

  async addProgram(partnerId: string, dto: CreatePartnerProgramDto, userId: number) {
    await this.findOne(partnerId);
    this.assertDateRange(dto.startDate, dto.endDate);
    await this.assertUserExists(dto.responsibleId);
    const { startDate, endDate, ...rest } = dto;
    const program = await this.prisma.partnerProgram.create({
      data: {
        ...rest,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        partnerId,
      },
      include: { responsible: { select: { fullName: true } } },
    });
    await this.audit.logEntity(userId, 'CREATE', 'PartnerProgram', program.id, {
      partnerId,
      program: dto.program,
    });
    return program;
  }

  async updateProgram(
    partnerId: string,
    programId: string,
    dto: UpdatePartnerProgramDto,
    userId: number,
  ) {
    const current = await this.findProgram(partnerId, programId);
    this.assertDateRange(dto.startDate ?? current.startDate, dto.endDate ?? current.endDate);
    await this.assertUserExists(dto.responsibleId);
    const { startDate, endDate, ...rest } = dto;
    const updated = await this.prisma.partnerProgram.update({
      where: { id: programId },
      data: {
        ...rest,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'PartnerProgram', programId, dto);
    return updated;
  }

  async removeProgram(partnerId: string, programId: string, userId: number) {
    await this.findProgram(partnerId, programId);
    await this.prisma.partnerProgram.update({
      where: { id: programId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'PartnerProgram', programId, { partnerId });
    return { message: 'Programa removido com sucesso' };
  }

  // ─── ACORDOS E CONTRATOS (⑥) ─────────────────────────

  async getAgreements(partnerId: string) {
    await this.findOne(partnerId);
    return this.prisma.read.partnerAgreement.findMany({
      where: { partnerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        responsible: { select: { fullName: true } },
        versions: { orderBy: { version: 'desc' }, take: 1 },
        _count: { select: { versions: true } },
      },
    });
  }

  private async findAgreement(partnerId: string, agreementId: string) {
    const agreement = await this.prisma.partnerAgreement.findFirst({
      where: { id: agreementId, partnerId, deletedAt: null },
    });
    if (!agreement) throw new NotFoundException('Acordo não encontrado');
    return agreement;
  }

  async getAgreement(partnerId: string, agreementId: string) {
    await this.findAgreement(partnerId, agreementId);
    return this.prisma.read.partnerAgreement.findUnique({
      where: { id: agreementId },
      include: {
        responsible: { select: { fullName: true } },
        versions: {
          orderBy: { version: 'desc' },
          include: { uploadedBy: { select: { fullName: true } } },
        },
      },
    });
  }

  async addAgreement(partnerId: string, dto: CreatePartnerAgreementDto, userId: number) {
    await this.findOne(partnerId);
    this.assertDateRange(dto.startDate, dto.endDate);
    await this.assertUserExists(dto.responsibleId);
    const { signedAt, startDate, endDate, ...rest } = dto;
    const agreement = await this.prisma.partnerAgreement.create({
      data: {
        ...rest,
        ...(signedAt && { signedAt: new Date(signedAt) }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        partnerId,
      },
      include: { responsible: { select: { fullName: true } } },
    });
    await this.audit.logEntity(userId, 'CREATE', 'PartnerAgreement', agreement.id, {
      partnerId,
      type: dto.type,
    });
    return agreement;
  }

  async updateAgreement(
    partnerId: string,
    agreementId: string,
    dto: UpdatePartnerAgreementDto,
    userId: number,
  ) {
    const current = await this.findAgreement(partnerId, agreementId);
    this.assertDateRange(dto.startDate ?? current.startDate, dto.endDate ?? current.endDate);
    await this.assertUserExists(dto.responsibleId);
    const { signedAt, startDate, endDate, ...rest } = dto;
    const updated = await this.prisma.partnerAgreement.update({
      where: { id: agreementId },
      data: {
        ...rest,
        ...(signedAt && { signedAt: new Date(signedAt) }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'PartnerAgreement', agreementId, dto);
    return updated;
  }

  async removeAgreement(partnerId: string, agreementId: string, userId: number) {
    await this.findAgreement(partnerId, agreementId);
    await this.prisma.partnerAgreement.update({
      where: { id: agreementId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'PartnerAgreement', agreementId, { partnerId });
    return { message: 'Acordo removido com sucesso' };
  }

  /** Anexa uma nova versão do documento; o número de versão é sequencial por acordo. */
  async addAgreementVersion(
    partnerId: string,
    agreementId: string,
    dto: CreateAgreementVersionDto,
    userId: number,
  ) {
    await this.findAgreement(partnerId, agreementId);
    // Serializável: dois uploads simultâneos não podem obter o mesmo número de versão
    const version = await this.prisma.$transaction(
      async tx => {
        const last = await tx.partnerAgreementVersion.aggregate({
          where: { agreementId },
          _max: { version: true },
        });
        return tx.partnerAgreementVersion.create({
          data: {
            ...dto,
            agreementId,
            uploadedById: userId,
            version: (last._max.version ?? 0) + 1,
          },
          include: { uploadedBy: { select: { fullName: true } } },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.audit.logEntity(userId, 'CREATE', 'PartnerAgreementVersion', version.id, {
      agreementId,
      version: version.version,
    });
    return version;
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
    await this.audit.logEntity(userId, 'CREATE', 'PartnerInteraction', interaction.id, {
      partnerId,
      type: dto.type,
    });
    return interaction;
  }

  async getInteractions(partnerId: string, page = 1, limit = 20) {
    await this.findOne(partnerId);
    const { skip, take } = calculatePagination(page, limit);
    const where = { partnerId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.read.partnerInteraction.findMany({
        where,
        skip,
        take,
        orderBy: { date: 'desc' },
        include: { user: { select: { fullName: true } } },
      }),
      this.prisma.read.partnerInteraction.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
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
    await this.audit.logEntity(userId, 'CREATE', 'PartnerMilestone', milestone.id, {
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
    await this.audit.logEntity(userId, 'UPDATE', 'PartnerMilestone', milestoneId, {
      status: 'COMPLETED',
    });
    return updated;
  }

  async getOverdueMilestones() {
    return this.prisma.read.partnerMilestone.findMany({
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
    return this.prisma.read.partner.findMany({
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
      this.prisma.read.partner.count({ where: { deletedAt: null } }),
      this.prisma.read.partner.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      this.prisma.read.partner.count({
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.read.partner.groupBy({
        by: ['type'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.read.partner.groupBy({
        by: ['tier'],
        where: { deletedAt: null, status: 'ACTIVE' },
        _count: { id: true },
      }),
      this.prisma.read.partner.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      this.prisma.read.partner.aggregate({
        _sum: { annualValue: true },
        where: { status: 'ACTIVE', deletedAt: null },
      }),
      this.prisma.read.partner.count({
        where: {
          status: 'ACTIVE',
          deletedAt: null,
          contractEnd: { lte: in30Days, gte: now },
        },
      }),
      this.prisma.read.partnerMilestone.count({
        where: {
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          dueDate: { lt: now },
          deletedAt: null,
        },
      }),
      this.prisma.read.partnerInteraction.findMany({
        where: { deletedAt: null },
        orderBy: { date: 'desc' },
        take: 5,
        include: {
          partner: { select: { name: true, code: true } },
          user: { select: { fullName: true } },
        },
      }),
      this.prisma.read.partner.aggregate({
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
      this.prisma.read.partner.count({ where }),
      this.prisma.read.partner.groupBy({
        by: ['type'],
        where,
        _count: { id: true },
      }),
      this.prisma.read.partner.groupBy({
        by: ['tier'],
        where,
        _count: { id: true },
      }),
      this.prisma.read.partner.aggregate({
        _sum: { annualValue: true },
        where: { ...where, status: 'ACTIVE' },
      }),
      this.prisma.read.partnerInteraction.count({
        where: { createdAt: { gte: startDate, lte: endDate } },
      }),
      this.prisma.read.partnerMilestone.count({
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
}
