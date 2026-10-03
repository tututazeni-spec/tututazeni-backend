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
  CreatePartnerContributionDto,
  UpdatePartnerContributionDto,
  CreatePartnerFunderLinkDto,
  UpdatePartnerFunderLinkDto,
  CreatePartnerOpportunityDto,
  UpdatePartnerOpportunityDto,
  CreatePartnerImpactIndicatorDto,
  UpdatePartnerImpactIndicatorDto,
  CreatePartnerDocumentDto,
  UpdatePartnerDocumentDto,
  CreatePartnerDocumentVersionDto,
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
        contributions: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { program: { select: { id: true, program: true } } },
        },
        funderLinks: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { funder: { select: { id: true, code: true, name: true } } },
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

  // ─── CONTRIBUIÇÃO DO PARCEIRO (⑦) ───────────────────

  private async assertProgramBelongsToPartner(partnerId: string, programId?: string) {
    if (!programId) return;
    await this.findProgram(partnerId, programId);
  }

  async getContributions(partnerId: string) {
    await this.findOne(partnerId);
    return this.prisma.read.partnerContribution.findMany({
      where: { partnerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { program: { select: { id: true, program: true } } },
    });
  }

  private async findContribution(partnerId: string, contributionId: string) {
    const contribution = await this.prisma.partnerContribution.findFirst({
      where: { id: contributionId, partnerId, deletedAt: null },
    });
    if (!contribution) throw new NotFoundException('Contribuição não encontrada');
    return contribution;
  }

  async addContribution(partnerId: string, dto: CreatePartnerContributionDto, userId: number) {
    await this.findOne(partnerId);
    this.assertDateRange(dto.startDate, dto.endDate);
    await this.assertProgramBelongsToPartner(partnerId, dto.programId);
    const { startDate, endDate, ...rest } = dto;
    const contribution = await this.prisma.partnerContribution.create({
      data: {
        ...rest,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        partnerId,
      },
      include: { program: { select: { id: true, program: true } } },
    });
    await this.audit.logEntity(userId, 'CREATE', 'PartnerContribution', contribution.id, {
      partnerId,
      type: dto.type,
    });
    return contribution;
  }

  async updateContribution(
    partnerId: string,
    contributionId: string,
    dto: UpdatePartnerContributionDto,
    userId: number,
  ) {
    const current = await this.findContribution(partnerId, contributionId);
    this.assertDateRange(dto.startDate ?? current.startDate, dto.endDate ?? current.endDate);
    await this.assertProgramBelongsToPartner(partnerId, dto.programId);
    const { startDate, endDate, ...rest } = dto;
    const updated = await this.prisma.partnerContribution.update({
      where: { id: contributionId },
      data: {
        ...rest,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'PartnerContribution', contributionId, dto);
    return updated;
  }

  async removeContribution(partnerId: string, contributionId: string, userId: number) {
    await this.findContribution(partnerId, contributionId);
    await this.prisma.partnerContribution.update({
      where: { id: contributionId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'PartnerContribution', contributionId, {
      partnerId,
    });
    return { message: 'Contribuição removida com sucesso' };
  }

  // ─── FINANCIAMENTO (⑧) — ligação a CRM → Funders ─────

  async getFunding(partnerId: string) {
    const partner = await this.findOne(partnerId);
    const links = await this.prisma.read.partnerFunderLink.findMany({
      where: { partnerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { funder: { select: { id: true, code: true, name: true, type: true } } },
    });
    // Totais por moeda: somar moedas diferentes seria enganador
    const totalsByCurrency: Record<string, number> = {};
    for (const l of links) {
      totalsByCurrency[l.currency] = (totalsByCurrency[l.currency] ?? 0) + (l.amountFunded ?? 0);
    }
    return { isFunder: partner.isFunder, links, totalsByCurrency };
  }

  private async findFunderLink(partnerId: string, linkId: string) {
    const link = await this.prisma.partnerFunderLink.findFirst({
      where: { id: linkId, partnerId, deletedAt: null },
    });
    if (!link) throw new NotFoundException('Ligação ao financiador não encontrada');
    return link;
  }

  async addFunderLink(partnerId: string, dto: CreatePartnerFunderLinkDto, userId: number) {
    await this.findOne(partnerId);
    this.assertDateRange(dto.periodStart, dto.periodEnd);
    const funder = await this.prisma.funder.findFirst({
      where: { id: dto.funderId, deletedAt: null },
      select: { id: true },
    });
    if (!funder) throw new BadRequestException('Financiador não encontrado');
    const { periodStart, periodEnd, ...rest } = dto;
    const link = await this.prisma.$transaction(async tx => {
      // Ter um financiador associado implica que o parceiro exerce o papel de financiador
      await tx.partner.update({ where: { id: partnerId }, data: { isFunder: true } });
      return tx.partnerFunderLink.create({
        data: {
          ...rest,
          ...(periodStart && { periodStart: new Date(periodStart) }),
          ...(periodEnd && { periodEnd: new Date(periodEnd) }),
          partnerId,
        },
        include: { funder: { select: { id: true, code: true, name: true, type: true } } },
      });
    });
    await this.audit.logEntity(userId, 'CREATE', 'PartnerFunderLink', link.id, {
      partnerId,
      funderId: dto.funderId,
    });
    return link;
  }

  async updateFunderLink(
    partnerId: string,
    linkId: string,
    dto: UpdatePartnerFunderLinkDto,
    userId: number,
  ) {
    const current = await this.findFunderLink(partnerId, linkId);
    this.assertDateRange(
      dto.periodStart ?? current.periodStart,
      dto.periodEnd ?? current.periodEnd,
    );
    const { periodStart, periodEnd, ...rest } = dto;
    const updated = await this.prisma.partnerFunderLink.update({
      where: { id: linkId },
      data: {
        ...rest,
        ...(periodStart && { periodStart: new Date(periodStart) }),
        ...(periodEnd && { periodEnd: new Date(periodEnd) }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'PartnerFunderLink', linkId, dto);
    return updated;
  }

  async removeFunderLink(partnerId: string, linkId: string, userId: number) {
    await this.findFunderLink(partnerId, linkId);
    await this.prisma.partnerFunderLink.update({
      where: { id: linkId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'PartnerFunderLink', linkId, { partnerId });
    return { message: 'Ligação ao financiador removida com sucesso' };
  }

  // ─── BENEFICIÁRIOS RELACIONADOS (⑨) ─────────────────
  // Só leitura: cruza os programas do parceiro (PartnerProgram.program) com as
  // participações já registadas em CRM → Beneficiários. Nada é duplicado.

  private async beneficiaryParticipationWhere(
    partnerId: string,
    program?: string,
  ): Promise<Prisma.BeneficiaryParticipationWhereInput | null> {
    const programs = await this.prisma.read.partnerProgram.findMany({
      where: { partnerId, deletedAt: null },
      select: { program: true },
    });
    // O filtro é case-insensitive, por isso "Crescer" e "crescer" contam como um só
    const byLower = new Map(programs.map(p => [p.program.trim().toLowerCase(), p.program.trim()]));
    let names = [...byLower.values()];
    if (program) names = names.filter(n => n.toLowerCase() === program.trim().toLowerCase());
    if (!names.length) return null;
    return {
      deletedAt: null,
      beneficiary: { deletedAt: null },
      OR: names.map(n => ({ program: { equals: n, mode: 'insensitive' as const } })),
    };
  }

  async getBeneficiariesSummary(partnerId: string) {
    await this.findOne(partnerId);
    const where = await this.beneficiaryParticipationWhere(partnerId);
    if (!where) {
      return {
        programs: [],
        totalBeneficiaries: 0,
        totalParticipations: 0,
        provinces: [],
        byStatus: [],
      };
    }
    const [byProgram, byStatus, provinces, distinct] = await Promise.all([
      this.prisma.read.beneficiaryParticipation.groupBy({
        by: ['program'],
        where,
        _count: { id: true },
      }),
      this.prisma.read.beneficiaryParticipation.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.read.beneficiaryParticipation.groupBy({
        by: ['province'],
        where: { ...where, province: { not: null } },
        _count: { id: true },
      }),
      this.prisma.read.beneficiaryParticipation.groupBy({ by: ['beneficiaryId'], where }),
    ]);
    return {
      programs: byProgram.map(p => ({ program: p.program, participations: p._count.id })),
      totalBeneficiaries: distinct.length,
      totalParticipations: byProgram.reduce((s, p) => s + p._count.id, 0),
      provinces: provinces.map(p => ({ province: p.province, participations: p._count.id })),
      byStatus: byStatus.map(s => ({ status: s.status, participations: s._count.id })),
    };
  }

  async getRelatedBeneficiaries(partnerId: string, page = 1, limit = 20, program?: string) {
    await this.findOne(partnerId);
    const { skip, take } = calculatePagination(page, limit);
    const where = await this.beneficiaryParticipationWhere(partnerId, program);
    if (!where) return buildPaginatedResponse([], 0, page, limit);
    const [data, total] = await Promise.all([
      this.prisma.read.beneficiaryParticipation.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          beneficiary: {
            select: { id: true, code: true, fullName: true, province: true, status: true },
          },
        },
      }),
      this.prisma.read.beneficiaryParticipation.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  // ─── OPORTUNIDADES DE PARCERIA (⑪) ──────────────────
  // Pipeline separado da parceria activa: uma oportunidade só vira programa/acordo
  // quando alguém os regista nos separadores respectivos.

  private static readonly OPPORTUNITY_CLOSED: string[] = ['AGREEMENT_REACHED', 'NOT_CONCLUDED'];

  async getOpportunities(partnerId: string) {
    await this.findOne(partnerId);
    return this.prisma.read.partnerOpportunity.findMany({
      where: { partnerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { responsible: { select: { id: true, fullName: true } } },
    });
  }

  private async findOpportunity(partnerId: string, opportunityId: string) {
    const opportunity = await this.prisma.partnerOpportunity.findFirst({
      where: { id: opportunityId, partnerId, deletedAt: null },
    });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada');
    return opportunity;
  }

  async addOpportunity(partnerId: string, dto: CreatePartnerOpportunityDto, userId: number) {
    await this.findOne(partnerId);
    await this.assertUserExists(dto.responsibleId);
    const { expectedDate, ...rest } = dto;
    const opportunity = await this.prisma.partnerOpportunity.create({
      data: {
        ...rest,
        ...(expectedDate && { expectedDate: new Date(expectedDate) }),
        ...(dto.status &&
          CrmPartnersService.OPPORTUNITY_CLOSED.includes(dto.status) && { closedAt: new Date() }),
        partnerId,
      },
      include: { responsible: { select: { id: true, fullName: true } } },
    });
    await this.audit.logEntity(userId, 'CREATE', 'PartnerOpportunity', opportunity.id, {
      partnerId,
      name: dto.name,
    });
    return opportunity;
  }

  async updateOpportunity(
    partnerId: string,
    opportunityId: string,
    dto: UpdatePartnerOpportunityDto,
    userId: number,
  ) {
    const current = await this.findOpportunity(partnerId, opportunityId);
    await this.assertUserExists(dto.responsibleId);
    const { expectedDate, ...rest } = dto;
    let closedAt: Date | null | undefined;
    if (dto.status && dto.status !== current.status) {
      closedAt = CrmPartnersService.OPPORTUNITY_CLOSED.includes(dto.status) ? new Date() : null;
    }
    const updated = await this.prisma.partnerOpportunity.update({
      where: { id: opportunityId },
      data: {
        ...rest,
        ...(expectedDate && { expectedDate: new Date(expectedDate) }),
        ...(closedAt !== undefined && { closedAt }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'PartnerOpportunity', opportunityId, dto);
    return updated;
  }

  async removeOpportunity(partnerId: string, opportunityId: string, userId: number) {
    await this.findOpportunity(partnerId, opportunityId);
    await this.prisma.partnerOpportunity.update({
      where: { id: opportunityId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'PartnerOpportunity', opportunityId, {
      partnerId,
    });
    return { message: 'Oportunidade removida com sucesso' };
  }

  /** Pipeline do parceiro: contagens por estado e valores (bruto e ponderado) por moeda. */
  async getOpportunityPipeline(partnerId: string) {
    const opportunities = await this.getOpportunities(partnerId);
    const byStatus = new Map<string, number>();
    const open = new Map<string, { currency: string; total: number; weighted: number }>();
    for (const o of opportunities) {
      byStatus.set(o.status, (byStatus.get(o.status) ?? 0) + 1);
      if (CrmPartnersService.OPPORTUNITY_CLOSED.includes(o.status)) continue;
      const entry = open.get(o.currency) ?? { currency: o.currency, total: 0, weighted: 0 };
      const value = o.potentialValue ?? 0;
      entry.total += value;
      entry.weighted += (value * (o.probability ?? 0)) / 100;
      open.set(o.currency, entry);
    }
    const won = byStatus.get('AGREEMENT_REACHED') ?? 0;
    const lost = byStatus.get('NOT_CONCLUDED') ?? 0;
    return {
      total: opportunities.length,
      open: opportunities.length - won - lost,
      won,
      lost,
      winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
      byStatus: [...byStatus].map(([status, count]) => ({ status, count })),
      openValueByCurrency: [...open.values()],
    };
  }

  // ─── DESEMPENHO DA PARCERIA (⑫) ─────────────────────
  // Quase tudo é derivado de dados já registados; só os indicadores de impacto
  // são introduzidos à mão (PartnerImpactIndicator).

  async getImpactIndicators(partnerId: string) {
    await this.findOne(partnerId);
    const indicators = await this.prisma.read.partnerImpactIndicator.findMany({
      where: { partnerId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return indicators.map(i => ({
      ...i,
      attainment: i.target ? Math.round((i.value / i.target) * 100) : null,
    }));
  }

  private async findImpactIndicator(partnerId: string, indicatorId: string) {
    const indicator = await this.prisma.partnerImpactIndicator.findFirst({
      where: { id: indicatorId, partnerId, deletedAt: null },
    });
    if (!indicator) throw new NotFoundException('Indicador não encontrado');
    return indicator;
  }

  async addImpactIndicator(
    partnerId: string,
    dto: CreatePartnerImpactIndicatorDto,
    userId: number,
  ) {
    await this.findOne(partnerId);
    this.assertDateRange(dto.periodStart, dto.periodEnd);
    const { periodStart, periodEnd, ...rest } = dto;
    const indicator = await this.prisma.partnerImpactIndicator.create({
      data: {
        ...rest,
        ...(periodStart && { periodStart: new Date(periodStart) }),
        ...(periodEnd && { periodEnd: new Date(periodEnd) }),
        partnerId,
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'PartnerImpactIndicator', indicator.id, {
      partnerId,
      name: dto.name,
    });
    return indicator;
  }

  async updateImpactIndicator(
    partnerId: string,
    indicatorId: string,
    dto: UpdatePartnerImpactIndicatorDto,
    userId: number,
  ) {
    const current = await this.findImpactIndicator(partnerId, indicatorId);
    this.assertDateRange(
      dto.periodStart ?? current.periodStart,
      dto.periodEnd ?? current.periodEnd,
    );
    const { periodStart, periodEnd, ...rest } = dto;
    const updated = await this.prisma.partnerImpactIndicator.update({
      where: { id: indicatorId },
      data: {
        ...rest,
        ...(periodStart && { periodStart: new Date(periodStart) }),
        ...(periodEnd && { periodEnd: new Date(periodEnd) }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'PartnerImpactIndicator', indicatorId, dto);
    return updated;
  }

  async removeImpactIndicator(partnerId: string, indicatorId: string, userId: number) {
    await this.findImpactIndicator(partnerId, indicatorId);
    await this.prisma.partnerImpactIndicator.update({
      where: { id: indicatorId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'PartnerImpactIndicator', indicatorId, {
      partnerId,
    });
    return { message: 'Indicador removido com sucesso' };
  }

  private sumByCurrency(rows: { currency: string; value: number | null }[]) {
    const totals = new Map<string, number>();
    for (const r of rows) {
      if (!r.value) continue;
      totals.set(r.currency, (totals.get(r.currency) ?? 0) + r.value);
    }
    return [...totals].map(([currency, total]) => ({ currency, total }));
  }

  async getPerformance(partnerId: string) {
    await this.findOne(partnerId);
    const now = new Date();
    const [programs, contributions, funding, milestones, beneficiaries, indicators] =
      await Promise.all([
        this.prisma.read.partnerProgram.findMany({
          where: { partnerId, deletedAt: null },
          select: { status: true },
        }),
        this.prisma.read.partnerContribution.findMany({
          where: { partnerId, deletedAt: null },
          select: { estimatedValue: true, currency: true, startDate: true },
        }),
        this.prisma.read.partnerFunderLink.findMany({
          where: { partnerId, deletedAt: null },
          select: { amountFunded: true, currency: true },
        }),
        this.prisma.read.partnerMilestone.findMany({
          where: { partnerId, deletedAt: null, status: { not: 'CANCELLED' } },
          select: { status: true, dueDate: true, completedAt: true },
        }),
        this.getBeneficiariesSummary(partnerId),
        this.getImpactIndicators(partnerId),
      ]);

    const programCount = (status: string) => programs.filter(p => p.status === status).length;
    const completedTrainings = beneficiaries.byStatus
      .filter(s => s.status === 'COMPLETED')
      .reduce((sum, s) => sum + s.participations, 0);

    // Compromissos "exigíveis": concluídos ou já vencidos
    const due = milestones.filter(m => m.status === 'COMPLETED' || m.dueDate <= now);
    const completed = due.filter(m => m.status === 'COMPLETED');
    const onTime = completed.filter(m => m.completedAt && m.completedAt <= m.dueDate);

    return {
      programs: {
        supported: programs.filter(p => p.status !== 'CANCELLED').length,
        active: programCount('ACTIVE'),
        completed: programCount('COMPLETED'),
      },
      beneficiaries: {
        reached: beneficiaries.totalBeneficiaries,
        participations: beneficiaries.totalParticipations,
        completedTrainings,
        provinces: beneficiaries.provinces.length,
      },
      invested: {
        contributionsByCurrency: this.sumByCurrency(
          contributions.map(c => ({ currency: c.currency, value: c.estimatedValue })),
        ),
        fundingByCurrency: this.sumByCurrency(
          funding.map(f => ({ currency: f.currency, value: f.amountFunded })),
        ),
      },
      contributions: {
        total: contributions.length,
        realized: contributions.filter(c => !c.startDate || c.startDate <= now).length,
      },
      commitments: {
        due: due.length,
        completed: completed.length,
        completedOnTime: onTime.length,
        complianceRate: due.length ? Math.round((completed.length / due.length) * 100) : null,
      },
      impactIndicators: indicators,
    };
  }

  // ─── DOCUMENTOS (⑬) ──────────────────────────────────
  // Um documento é identificado por (parceiro, nome); cada nova versão é uma linha
  // com o número seguinte, por isso o histórico fica sempre acessível.

  async getDocuments(partnerId: string, includeHistory = false) {
    await this.findOne(partnerId);
    const docs = await this.prisma.read.partnerDocument.findMany({
      where: { partnerId, deletedAt: null },
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
      include: { responsible: { select: { id: true, fullName: true } } },
    });
    const now = new Date();
    // Validade vencida aparece como EXPIRED sem precisar de job a actualizar a coluna
    const withStatus = docs.map(d =>
      d.status === 'VALID' && d.validUntil && d.validUntil < now
        ? { ...d, status: 'EXPIRED' as const }
        : d,
    );
    if (includeHistory) return withStatus;
    // ordenado por versão desc dentro do nome → a primeira de cada nome é a mais recente
    const seen = new Set<string>();
    return withStatus.filter(d => {
      if (seen.has(d.name)) return false;
      seen.add(d.name);
      return true;
    });
  }

  private async findDocument(partnerId: string, documentId: string) {
    const doc = await this.prisma.partnerDocument.findFirst({
      where: { id: documentId, partnerId, deletedAt: null },
    });
    if (!doc) throw new NotFoundException('Documento não encontrado');
    return doc;
  }

  async getDocumentHistory(partnerId: string, documentId: string) {
    const doc = await this.findDocument(partnerId, documentId);
    return this.prisma.read.partnerDocument.findMany({
      where: { partnerId, name: doc.name, deletedAt: null },
      orderBy: { version: 'desc' },
      include: { uploadedBy: { select: { id: true, fullName: true } } },
    });
  }

  async addDocument(partnerId: string, dto: CreatePartnerDocumentDto, userId: number) {
    await this.findOne(partnerId);
    await this.assertUserExists(dto.responsibleId);
    this.assertDateRange(dto.documentDate, dto.validUntil);
    const existing = await this.prisma.partnerDocument.findFirst({
      where: { partnerId, name: dto.name, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        'Já existe um documento com este nome — carregue uma nova versão em vez de o duplicar',
      );
    }
    const { documentDate, validUntil, ...rest } = dto;
    // O @@unique cobre também versões apagadas, por isso a numeração continua a partir delas
    const last = await this.prisma.partnerDocument.aggregate({
      where: { partnerId, name: dto.name },
      _max: { version: true },
    });
    const doc = await this.prisma.partnerDocument.create({
      data: {
        ...rest,
        ...(documentDate && { documentDate: new Date(documentDate) }),
        ...(validUntil && { validUntil: new Date(validUntil) }),
        partnerId,
        uploadedById: userId,
        version: (last._max.version ?? 0) + 1,
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'PartnerDocument', doc.id, {
      partnerId,
      name: dto.name,
      type: dto.type,
    });
    return doc;
  }

  async updateDocument(
    partnerId: string,
    documentId: string,
    dto: UpdatePartnerDocumentDto,
    userId: number,
  ) {
    const current = await this.findDocument(partnerId, documentId);
    await this.assertUserExists(dto.responsibleId);
    this.assertDateRange(
      dto.documentDate ?? current.documentDate,
      dto.validUntil ?? current.validUntil,
    );
    const { documentDate, validUntil, ...rest } = dto;
    const updated = await this.prisma.partnerDocument.update({
      where: { id: documentId },
      data: {
        ...rest,
        ...(documentDate && { documentDate: new Date(documentDate) }),
        ...(validUntil && { validUntil: new Date(validUntil) }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'PartnerDocument', documentId, dto);
    return updated;
  }

  async addDocumentVersion(
    partnerId: string,
    documentId: string,
    dto: CreatePartnerDocumentVersionDto,
    userId: number,
  ) {
    const current = await this.findDocument(partnerId, documentId);
    this.assertDateRange(dto.documentDate, dto.validUntil);
    const { documentDate, validUntil, ...rest } = dto;
    // Serializável: dois uploads simultâneos não podem obter o mesmo número de versão
    const doc = await this.prisma.$transaction(
      async tx => {
        const last = await tx.partnerDocument.aggregate({
          where: { partnerId, name: current.name },
          _max: { version: true },
        });
        return tx.partnerDocument.create({
          data: {
            ...rest,
            ...(documentDate && { documentDate: new Date(documentDate) }),
            ...(validUntil && { validUntil: new Date(validUntil) }),
            partnerId,
            name: current.name,
            type: current.type,
            responsibleId: current.responsibleId,
            status: 'VALID',
            uploadedById: userId,
            version: (last._max.version ?? 0) + 1,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    await this.audit.logEntity(userId, 'CREATE', 'PartnerDocument', doc.id, {
      partnerId,
      name: doc.name,
      version: doc.version,
    });
    return doc;
  }

  async removeDocument(partnerId: string, documentId: string, userId: number) {
    await this.findDocument(partnerId, documentId);
    await this.prisma.partnerDocument.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'PartnerDocument', documentId, { partnerId });
    return { message: 'Documento removido com sucesso' };
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
