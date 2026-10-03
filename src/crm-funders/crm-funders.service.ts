import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, GrantStatus, DisbursementStatus, FunderIndicatorKey } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateFunderDto,
  CreateFunderContactDto,
  UpdateFunderContactDto,
  CreateFunderProgramDto,
  UpdateFunderProgramDto,
  UpdateFunderDto,
  FilterFunderDto,
  CreateGrantDto,
  UpdateGrantDto,
  CreateDisbursementDto,
  UpdateDisbursementDto,
  CreateFunderOpportunityDto,
  UpdateFunderOpportunityDto,
  CreateOpportunityDocumentDto,
  CreateFunderInteractionDto,
  UpdateFunderInteractionDto,
  FilterFunderInteractionDto,
  CreateFunderPartnerLinkDto,
  UpdateFunderPartnerLinkDto,
  FilterFunderBeneficiaryDto,
  CreateFunderReportDto,
  UpdateFunderReportDto,
  FilterFunderReportDto,
  CreateFunderContractDto,
  UpdateFunderContractDto,
  CreateFunderIndicatorDto,
  UpdateFunderIndicatorDto,
  FilterFunderIndicatorDto,
  PaginationFilterDto,
} from './dto';
import { AuditService } from '../common/services/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';

const MS_PER_DAY = 86_400_000;
const DEFAULT_CURRENCY = 'AOA'; // moeda oficial: Kwanza angolano
const DEFAULT_PAGE_SIZE = 20;
const EXECUTING_GRANT_STATUSES: GrantStatus[] = ['ACTIVE', 'IN_EXECUTION'];
const MAX_PAGE_SIZE = 100; // tecto de paginação (alinhado com @Max(100) nos DTOs de filtro)

@Injectable()
export class CrmFundersService {
  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
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
    const rows = await this.prisma.$queryRaw<{ nextval: bigint }[]>`
      SELECT nextval(${sequence}::regclass) AS nextval
    `;
    return `${prefix}-${String(Number(rows[0].nextval)).padStart(5, '0')}`;
  }

  // ─── CRUD FINANCIADORES ──────────────────────────────

  async create(dto: CreateFunderDto, userId: number) {
    const { relationshipStart, nextReportDue, registeredAt, contacts, ...rest } = dto;
    this.assertSinglePrimary(contacts);
    this.assertRanges(dto);
    const code = await this.generateCode('FIN', 'funder');
    const funder = await this.prisma.funder.create({
      data: {
        ...rest,
        ...(registeredAt && { registeredAt: new Date(registeredAt) }),
        ...(contacts?.length && {
          contacts: { create: this.normalizeContacts(contacts) },
        }),
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
        contacts: { where: { deletedAt: null }, orderBy: { isPrimary: 'desc' } },
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'Funder', funder.id, {
      code,
      type: dto.type,
    });
    return funder;
  }

  async findAll(filters: FilterFunderDto) {
    const {
      type,
      status,
      search,
      country,
      assignedToId,
      sector,
      thematicArea,
      fundingType,
      page = 1,
      limit = 20,
    } = filters;
    const where: Prisma.FunderWhereInput = {
      deletedAt: null,
      ...(type && { type }),
      ...(status && { status }),
      ...(country && { country }),
      ...(assignedToId && { assignedToId }),
      ...(sector && { sector: { contains: sector, mode: 'insensitive' } }),
      ...(thematicArea && { thematicAreas: { has: thematicArea } }),
      ...(fundingType && { fundingTypes: { has: fundingType } }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { commercialName: { contains: search, mode: 'insensitive' } },
          { registrationNumber: { contains: search, mode: 'insensitive' } },
          { nif: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.read.funder.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { fullName: true } },
          _count: { select: { grants: true, interactions: true } },
        },
      }),
      this.prisma.read.funder.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(data, total, page, limit);
    return { data: pageData, ...meta };
  }

  async findOne(id: string) {
    const funder = await this.prisma.read.funder.findUnique({
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
        grants: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            _count: { select: { disbursements: true } },
          },
        },
        opportunities: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: { documents: { where: { deletedAt: null } } },
        },
        interactions: {
          where: { deletedAt: null },
          orderBy: { date: 'desc' },
          take: 20,
          include: { user: { select: { fullName: true } } },
        },
        contracts: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        indicators: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
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
    const current = await this.findOne(id);
    this.assertRanges({ ...current, ...dto });
    const { relationshipStart, nextReportDue, registeredAt, ...rest } = dto;
    const updated = await this.prisma.funder.update({
      where: { id },
      data: {
        ...rest,
        ...(registeredAt && { registeredAt: new Date(registeredAt) }),
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

  // ─── CONTACTOS (③) ───────────────────────────────────

  private assertSinglePrimary(contacts?: { isPrimary?: boolean }[]) {
    if (contacts && contacts.filter(c => c.isPrimary).length > 1) {
      throw new BadRequestException('Apenas um contacto pode ser principal');
    }
  }

  /** Se nenhum for marcado como principal, o primeiro da lista assume o papel. */
  private normalizeContacts(contacts: CreateFunderContactDto[]) {
    const hasPrimary = contacts.some(c => c.isPrimary);
    return contacts.map((c, i) => ({ ...c, isPrimary: hasPrimary ? !!c.isPrimary : i === 0 }));
  }

  async getContacts(funderId: string) {
    await this.findOne(funderId);
    return this.prisma.read.funderContact.findMany({
      where: { funderId, deletedAt: null },
      orderBy: [{ isPrimary: 'desc' }, { firstName: 'asc' }],
    });
  }

  private async findContact(funderId: string, contactId: string) {
    const contact = await this.prisma.funderContact.findFirst({
      where: { id: contactId, funderId, deletedAt: null },
    });
    if (!contact) throw new NotFoundException('Contacto não encontrado');
    return contact;
  }

  async addContact(funderId: string, dto: CreateFunderContactDto, userId: number) {
    await this.findOne(funderId);
    const contact = await this.prisma.$transaction(async tx => {
      const existing = await tx.funderContact.count({ where: { funderId, deletedAt: null } });
      // O primeiro contacto é sempre o principal
      const isPrimary = dto.isPrimary || existing === 0;
      if (isPrimary) {
        await tx.funderContact.updateMany({
          where: { funderId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.funderContact.create({ data: { ...dto, isPrimary, funderId } });
    });
    await this.audit.logEntity(userId, 'CREATE', 'FunderContact', contact.id, { funderId });
    return contact;
  }

  async updateContact(
    funderId: string,
    contactId: string,
    dto: UpdateFunderContactDto,
    userId: number,
  ) {
    const current = await this.findContact(funderId, contactId);
    if (dto.isPrimary === false && current.isPrimary) {
      throw new BadRequestException(
        'Para mudar o contacto principal, marque outro contacto como principal',
      );
    }
    const updated = await this.prisma.$transaction(async tx => {
      if (dto.isPrimary) {
        await tx.funderContact.updateMany({
          where: { funderId, isPrimary: true, id: { not: contactId } },
          data: { isPrimary: false },
        });
      }
      return tx.funderContact.update({ where: { id: contactId }, data: dto });
    });
    await this.audit.logEntity(userId, 'UPDATE', 'FunderContact', contactId, dto);
    return updated;
  }

  async removeContact(funderId: string, contactId: string, userId: number) {
    const current = await this.findContact(funderId, contactId);
    await this.prisma.$transaction(async tx => {
      await tx.funderContact.update({
        where: { id: contactId },
        data: { deletedAt: new Date(), isPrimary: false },
      });
      // Se removeu o principal, promove o contacto mais antigo restante
      if (current.isPrimary) {
        const next = await tx.funderContact.findFirst({
          where: { funderId, deletedAt: null },
          orderBy: { createdAt: 'asc' },
        });
        if (next) {
          await tx.funderContact.update({ where: { id: next.id }, data: { isPrimary: true } });
        }
      }
    });
    await this.audit.logEntity(userId, 'DELETE', 'FunderContact', contactId, { funderId });
    return { message: 'Contacto removido com sucesso' };
  }

  // ─── PERFIL DE FINANCIAMENTO (④) E ELEGIBILIDADE (⑤) ──

  /** Coerência dos intervalos mínimo/máximo dos blocos ④ e ⑤. */
  private assertRanges(f: {
    typicalMinAmount?: number | null;
    typicalMaxAmount?: number | null;
    eligibleMinAge?: number | null;
    eligibleMaxAge?: number | null;
    eligibleMinProjectSize?: number | null;
    eligibleMaxProjectSize?: number | null;
    eligibleMinDurationMonths?: number | null;
    eligibleMaxDurationMonths?: number | null;
  }) {
    const pairs: [number | null | undefined, number | null | undefined, string][] = [
      [f.typicalMinAmount, f.typicalMaxAmount, 'valor habitual'],
      [f.eligibleMinAge, f.eligibleMaxAge, 'idade'],
      [f.eligibleMinProjectSize, f.eligibleMaxProjectSize, 'dimensão do projecto'],
      [f.eligibleMinDurationMonths, f.eligibleMaxDurationMonths, 'prazo'],
    ];
    for (const [min, max, label] of pairs) {
      if (min != null && max != null && max < min) {
        throw new BadRequestException(`O máximo de ${label} não pode ser inferior ao mínimo`);
      }
    }
  }

  // ─── PROGRAMAS E PROJECTOS FINANCIADOS (⑥) ───────────

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

  async getPrograms(funderId: string) {
    await this.findOne(funderId);
    return this.prisma.read.funderProgram.findMany({
      where: { funderId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { responsible: { select: { fullName: true } } },
    });
  }

  private async findProgram(funderId: string, programId: string) {
    const program = await this.prisma.funderProgram.findFirst({
      where: { id: programId, funderId, deletedAt: null },
    });
    if (!program) throw new NotFoundException('Programa do financiador não encontrado');
    return program;
  }

  async addProgram(funderId: string, dto: CreateFunderProgramDto, userId: number) {
    await this.findOne(funderId);
    this.assertDateRange(dto.startDate, dto.endDate);
    await this.assertUserExists(dto.responsibleId);
    const { startDate, endDate, ...rest } = dto;
    const program = await this.prisma.funderProgram.create({
      data: {
        ...rest,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        funderId,
      },
      include: { responsible: { select: { fullName: true } } },
    });
    await this.audit.logEntity(userId, 'CREATE', 'FunderProgram', program.id, {
      funderId,
      program: dto.program,
    });
    return program;
  }

  async updateProgram(
    funderId: string,
    programId: string,
    dto: UpdateFunderProgramDto,
    userId: number,
  ) {
    const current = await this.findProgram(funderId, programId);
    this.assertDateRange(dto.startDate ?? current.startDate, dto.endDate ?? current.endDate);
    await this.assertUserExists(dto.responsibleId);
    const { startDate, endDate, ...rest } = dto;
    const updated = await this.prisma.funderProgram.update({
      where: { id: programId },
      data: {
        ...rest,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'FunderProgram', programId, dto);
    return updated;
  }

  async removeProgram(funderId: string, programId: string, userId: number) {
    await this.findProgram(funderId, programId);
    await this.prisma.funderProgram.update({
      where: { id: programId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'FunderProgram', programId, { funderId });
    return { message: 'Programa removido com sucesso' };
  }

  // ─── FINANCIAMENTOS (⑦) ──────────────────────────────

  /** Saldo = valor aprovado − valor utilizado. */
  private withBalance<T extends { amount: number; usedAmount: number }>(grant: T) {
    return { ...grant, balance: grant.amount - grant.usedAmount };
  }

  private async assertProgramOfFunder(funderId: string, programId?: string | null) {
    if (!programId) return;
    const program = await this.prisma.funderProgram.findFirst({
      where: { id: programId, funderId, deletedAt: null },
      select: { id: true },
    });
    if (!program) throw new BadRequestException('Programa não pertence a este financiador');
  }

  private assertGrantAmounts(g: { amount?: number; usedAmount?: number | null }) {
    if (g.amount != null && g.usedAmount != null && g.usedAmount > g.amount) {
      throw new BadRequestException('O valor utilizado não pode exceder o valor aprovado');
    }
  }

  async createGrant(funderId: string, dto: CreateGrantDto, userId: number) {
    await this.findOne(funderId);
    this.assertDateRange(dto.startDate, dto.endDate);
    this.assertGrantAmounts(dto);
    await this.assertProgramOfFunder(funderId, dto.programId);
    const code = await this.generateCode('GRT', 'fundingGrant');
    const { startDate, endDate, nextReportDue, approvalDate, ...rest } = dto;
    const grant = await this.prisma.fundingGrant.create({
      data: {
        ...rest,
        startDate: new Date(startDate),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(nextReportDue && { nextReportDue: new Date(nextReportDue) }),
        ...(approvalDate && { approvalDate: new Date(approvalDate) }),
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
    return this.withBalance(grant);
  }

  /** Notificação de grant criado — efeito secundário enfileirado (fire-and-forget). */
  private notifyGrantCreated(
    grant: { id: string; title: string; funderId: string },
    dto: CreateGrantDto,
    userId: number,
  ) {
    const currency = dto.currency || DEFAULT_CURRENCY;
    return this.notifications.enqueueSend({
      userId,
      type: 'GRANT_CREATED',
      title: 'Novo financiamento registado',
      message: `Grant "${grant.title}" no valor de ${currency} ${dto.amount.toLocaleString('pt-AO')} criado.`,
      metadata: { grantId: grant.id, funderId: grant.funderId },
    });
  }

  async findGrants(funderId: string, filters: PaginationFilterDto) {
    await this.findOne(funderId);
    const { page = 1, limit = 20 } = filters;
    const where = { funderId, deletedAt: null };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.read.fundingGrant.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          program: { select: { program: true, project: true } },
          _count: { select: { disbursements: true, reports: true } },
        },
      }),
      this.prisma.read.fundingGrant.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(
      data.map(g => this.withBalance(g)),
      total,
      page,
      limit,
    );
    return { data: pageData, ...meta };
  }

  private async findGrantOrFail(grantId: string) {
    const grant = await this.prisma.fundingGrant.findUnique({ where: { id: grantId } });
    if (!grant || grant.deletedAt) throw new NotFoundException('Grant não encontrado');
    return grant;
  }

  async getGrant(grantId: string) {
    const grant = await this.prisma.read.fundingGrant.findUnique({
      where: { id: grantId },
      include: {
        program: { select: { program: true, project: true } },
        disbursements: { where: { deletedAt: null }, orderBy: { installmentNumber: 'asc' } },
      },
    });
    if (!grant || grant.deletedAt) throw new NotFoundException('Grant não encontrado');
    return this.withBalance(grant);
  }

  async updateGrant(grantId: string, dto: UpdateGrantDto, userId: number) {
    const current = await this.findGrantOrFail(grantId);
    const { startDate, endDate, nextReportDue, approvalDate, ...rest } = dto;
    this.assertDateRange(startDate ?? current.startDate, endDate ?? current.endDate);
    this.assertGrantAmounts({
      amount: dto.amount ?? current.amount,
      usedAmount: dto.usedAmount ?? current.usedAmount,
    });
    if (dto.amount != null && dto.amount < current.disbursed) {
      throw new BadRequestException('O valor aprovado não pode ser inferior ao já desembolsado');
    }
    await this.assertProgramOfFunder(current.funderId, dto.programId);
    const updated = await this.prisma.fundingGrant.update({
      where: { id: grantId },
      data: {
        ...rest,
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(nextReportDue && { nextReportDue: new Date(nextReportDue) }),
        ...(approvalDate && { approvalDate: new Date(approvalDate) }),
      },
    });
    await this.updateFunderTotals(current.funderId);
    await this.audit.logEntity(userId, 'UPDATE', 'FundingGrant', grantId, dto);
    return this.withBalance(updated);
  }

  async updateGrantStatus(grantId: string, status: string, userId: number) {
    // `status` chega de @Body('status') status: string no controller, sem
    // validação de DTO/enum — antes disto era passado directo com `as any`,
    // deixando um valor inválido rebentar como erro de validação do Prisma
    // (500) em vez de 400.
    if (!Object.values(GrantStatus).includes(status as GrantStatus)) {
      throw new BadRequestException(`Status de grant inválido: ${status}`);
    }
    const grant = await this.prisma.fundingGrant.findUnique({
      where: { id: grantId },
    });
    if (!grant) throw new NotFoundException('Grant não encontrado');
    const updated = await this.prisma.fundingGrant.update({
      where: { id: grantId },
      data: { status: status as GrantStatus },
    });
    await this.updateFunderTotals(grant.funderId);
    await this.audit.logEntity(userId, 'UPDATE', 'FundingGrant', grantId, { status });
    return updated;
  }

  // ─── DESEMBOLSOS (⑧) ─────────────────────────────────

  /** Soma das parcelas que ainda contam para o valor aprovado (tudo menos canceladas). */
  private async sumCommittedParcels(grantId: string, excludeId?: string): Promise<number> {
    const agg = await this.prisma.grantDisbursement.aggregate({
      where: {
        grantId,
        deletedAt: null,
        status: { not: 'CANCELLED' },
        ...(excludeId && { id: { not: excludeId } }),
      },
      _sum: { amount: true },
    });
    return agg?._sum?.amount ?? 0;
  }

  /** O desembolsado do financiamento é sempre derivado das parcelas recebidas. */
  private async syncGrantDisbursed(grantId: string, funderId: string) {
    const agg = await this.prisma.grantDisbursement.aggregate({
      where: { grantId, deletedAt: null, status: 'RECEIVED' },
      _sum: { amount: true },
    });
    await this.prisma.fundingGrant.update({
      where: { id: grantId },
      data: { disbursed: agg?._sum?.amount ?? 0 },
    });
    await this.updateFunderTotals(funderId);
  }

  /** Estado/data efectiva coerentes: RECEIVED tem data (por omissão, agora); os restantes não. */
  private resolveDisbursementState(dto: {
    status?: DisbursementStatus;
    receivedAt?: string | Date | null;
  }) {
    const status: DisbursementStatus = dto.status ?? (dto.receivedAt ? 'RECEIVED' : 'PREDICTED');
    if (status !== 'RECEIVED' && dto.receivedAt) {
      throw new BadRequestException('Só uma parcela recebida pode ter data efectiva');
    }
    const receivedAt = status === 'RECEIVED' ? new Date(dto.receivedAt ?? new Date()) : null;
    return { status, receivedAt };
  }

  private async assertInstallmentFree(grantId: string, n: number, excludeId?: string) {
    const clash = await this.prisma.grantDisbursement.findFirst({
      where: {
        grantId,
        installmentNumber: n,
        deletedAt: null,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (clash) throw new BadRequestException(`A parcela nº ${n} já existe neste financiamento`);
  }

  async addDisbursement(grantId: string, dto: CreateDisbursementDto, userId: number) {
    const grant = await this.findGrantOrFail(grantId);
    const { status, receivedAt } = this.resolveDisbursementState(dto);

    if (status !== 'CANCELLED') {
      const committed = await this.sumCommittedParcels(grantId);
      if (committed + dto.amount > grant.amount) {
        throw new BadRequestException(
          `Desembolso excede o valor total do grant (${grant.amount} ${grant.currency})`,
        );
      }
    }

    let installmentNumber = dto.installmentNumber;
    if (installmentNumber != null) {
      await this.assertInstallmentFree(grantId, installmentNumber);
    } else {
      const last = await this.prisma.grantDisbursement.aggregate({
        where: { grantId, deletedAt: null },
        _max: { installmentNumber: true },
      });
      installmentNumber = (last?._max?.installmentNumber ?? 0) + 1;
    }

    const { expectedDate, receivedAt: _received, status: _status, ...rest } = dto;
    const disbursement = await this.prisma.grantDisbursement.create({
      data: {
        ...rest,
        installmentNumber,
        status,
        receivedAt,
        ...(expectedDate && { expectedDate: new Date(expectedDate) }),
        grantId,
        createdById: userId,
      },
    });

    await this.syncGrantDisbursed(grantId, grant.funderId);
    await this.audit.logEntity(userId, 'CREATE', 'GrantDisbursement', disbursement.id, {
      grantId,
      amount: dto.amount,
      status,
    });
    return disbursement;
  }

  async updateDisbursement(
    grantId: string,
    disbursementId: string,
    dto: UpdateDisbursementDto,
    userId: number,
  ) {
    const grant = await this.findGrantOrFail(grantId);
    const current = await this.prisma.grantDisbursement.findFirst({
      where: { id: disbursementId, grantId, deletedAt: null },
    });
    if (!current) throw new NotFoundException('Desembolso não encontrado');

    const statusTouched = dto.status !== undefined || dto.receivedAt !== undefined;
    const state = statusTouched
      ? this.resolveDisbursementState({
          status: dto.status ?? (dto.receivedAt ? undefined : current.status),
          receivedAt:
            dto.receivedAt ?? (dto.status === 'RECEIVED' ? current.receivedAt : undefined),
        })
      : { status: current.status, receivedAt: current.receivedAt };

    const amount = dto.amount ?? current.amount;
    if (state.status !== 'CANCELLED') {
      const others = await this.sumCommittedParcels(grantId, disbursementId);
      if (others + amount > grant.amount) {
        throw new BadRequestException(
          `Desembolso excede o valor total do grant (${grant.amount} ${grant.currency})`,
        );
      }
    }
    if (dto.installmentNumber != null && dto.installmentNumber !== current.installmentNumber) {
      await this.assertInstallmentFree(grantId, dto.installmentNumber, disbursementId);
    }

    const { expectedDate, receivedAt: _received, status: _status, ...rest } = dto;
    const updated = await this.prisma.grantDisbursement.update({
      where: { id: disbursementId },
      data: {
        ...rest,
        ...(expectedDate && { expectedDate: new Date(expectedDate) }),
        ...(statusTouched && { status: state.status, receivedAt: state.receivedAt }),
      },
    });
    await this.syncGrantDisbursed(grantId, grant.funderId);
    await this.audit.logEntity(userId, 'UPDATE', 'GrantDisbursement', disbursementId, dto);
    return updated;
  }

  async removeDisbursement(grantId: string, disbursementId: string, userId: number) {
    const grant = await this.findGrantOrFail(grantId);
    const current = await this.prisma.grantDisbursement.findFirst({
      where: { id: disbursementId, grantId, deletedAt: null },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Desembolso não encontrado');
    await this.prisma.grantDisbursement.update({
      where: { id: disbursementId },
      data: { deletedAt: new Date() },
    });
    await this.syncGrantDisbursed(grantId, grant.funderId);
    await this.audit.logEntity(userId, 'DELETE', 'GrantDisbursement', disbursementId, { grantId });
    return { message: 'Desembolso removido com sucesso' };
  }

  async getDisbursements(grantId: string, filters: PaginationFilterDto) {
    const { page = 1, limit = 20 } = filters;
    const where = { grantId, deletedAt: null };
    const { skip, take } = calculatePagination(page, limit);
    const [data, total] = await Promise.all([
      this.prisma.read.grantDisbursement.findMany({
        where,
        skip,
        take,
        orderBy: [{ installmentNumber: 'asc' }, { createdAt: 'asc' }],
        include: { createdBy: { select: { fullName: true } } },
      }),
      this.prisma.read.grantDisbursement.count({ where }),
    ]);
    const { data: pageData, meta } = buildPaginatedResponse(data, total, page, limit);
    return { data: pageData, ...meta };
  }

  // ─── CANDIDATURAS / OPORTUNIDADES (⑨) ────────────────

  private async findOpportunity(funderId: string, opportunityId: string) {
    const opportunity = await this.prisma.funderOpportunity.findFirst({
      where: { id: opportunityId, funderId, deletedAt: null },
    });
    if (!opportunity) throw new NotFoundException('Oportunidade não encontrada');
    return opportunity;
  }

  async getOpportunities(funderId: string) {
    await this.findOne(funderId);
    return this.prisma.read.funderOpportunity.findMany({
      where: { funderId, deletedAt: null },
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
      include: {
        program: { select: { program: true, project: true } },
        responsible: { select: { fullName: true } },
        documents: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async addOpportunity(funderId: string, dto: CreateFunderOpportunityDto, userId: number) {
    await this.findOne(funderId);
    this.assertDateRange(dto.openingDate, dto.deadline);
    this.assertDateRange(dto.deadline, dto.expectedDecisionDate);
    await this.assertProgramOfFunder(funderId, dto.programId);
    await this.assertUserExists(dto.responsibleId);
    const { openingDate, deadline, expectedDecisionDate, ...rest } = dto;
    const opportunity = await this.prisma.funderOpportunity.create({
      data: {
        ...rest,
        ...(openingDate && { openingDate: new Date(openingDate) }),
        ...(deadline && { deadline: new Date(deadline) }),
        ...(expectedDecisionDate && { expectedDecisionDate: new Date(expectedDecisionDate) }),
        funderId,
      },
      include: { documents: true },
    });
    await this.audit.logEntity(userId, 'CREATE', 'FunderOpportunity', opportunity.id, {
      funderId,
      name: dto.name,
    });
    return opportunity;
  }

  async updateOpportunity(
    funderId: string,
    opportunityId: string,
    dto: UpdateFunderOpportunityDto,
    userId: number,
  ) {
    const current = await this.findOpportunity(funderId, opportunityId);
    const deadline = dto.deadline ?? current.deadline;
    this.assertDateRange(dto.openingDate ?? current.openingDate, deadline);
    this.assertDateRange(deadline, dto.expectedDecisionDate ?? current.expectedDecisionDate);
    await this.assertProgramOfFunder(funderId, dto.programId);
    await this.assertUserExists(dto.responsibleId);
    const { openingDate, deadline: dl, expectedDecisionDate, ...rest } = dto;
    const updated = await this.prisma.funderOpportunity.update({
      where: { id: opportunityId },
      data: {
        ...rest,
        ...(openingDate && { openingDate: new Date(openingDate) }),
        ...(dl && { deadline: new Date(dl) }),
        ...(expectedDecisionDate && { expectedDecisionDate: new Date(expectedDecisionDate) }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'FunderOpportunity', opportunityId, dto);
    return updated;
  }

  async removeOpportunity(funderId: string, opportunityId: string, userId: number) {
    await this.findOpportunity(funderId, opportunityId);
    await this.prisma.funderOpportunity.update({
      where: { id: opportunityId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'FunderOpportunity', opportunityId, { funderId });
    return { message: 'Oportunidade removida com sucesso' };
  }

  async addOpportunityDocument(
    funderId: string,
    opportunityId: string,
    dto: CreateOpportunityDocumentDto,
    userId: number,
  ) {
    await this.findOpportunity(funderId, opportunityId);
    const document = await this.prisma.funderOpportunityDocument.create({
      data: { ...dto, opportunityId },
    });
    await this.audit.logEntity(userId, 'CREATE', 'FunderOpportunityDocument', document.id, {
      opportunityId,
      type: dto.type,
    });
    return document;
  }

  async removeOpportunityDocument(
    funderId: string,
    opportunityId: string,
    documentId: string,
    userId: number,
  ) {
    await this.findOpportunity(funderId, opportunityId);
    const document = await this.prisma.funderOpportunityDocument.findFirst({
      where: { id: documentId, opportunityId, deletedAt: null },
      select: { id: true },
    });
    if (!document) throw new NotFoundException('Documento não encontrado');
    await this.prisma.funderOpportunityDocument.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'FunderOpportunityDocument', documentId, {
      opportunityId,
    });
    return { message: 'Documento removido com sucesso' };
  }

  // ─── CONTRATOS E ACORDOS (⑩) ─────────────────────────

  private async assertGrantOfFunder(funderId: string, grantId?: string | null) {
    if (!grantId) return;
    const grant = await this.prisma.fundingGrant.findFirst({
      where: { id: grantId, funderId, deletedAt: null },
      select: { id: true },
    });
    if (!grant) throw new BadRequestException('Financiamento não pertence a este financiador');
  }

  private async assertContactOfFunder(funderId: string, contactId?: string | null) {
    if (!contactId) return;
    const contact = await this.prisma.funderContact.findFirst({
      where: { id: contactId, funderId, deletedAt: null },
      select: { id: true },
    });
    if (!contact) throw new BadRequestException('Contacto não pertence a este financiador');
  }

  /** Dias até ao termo (negativo = já terminou); null sem data de término. */
  private withContractExpiry<T extends { endDate: Date | null }>(contract: T) {
    const daysToExpiry = contract.endDate
      ? Math.ceil((contract.endDate.getTime() - Date.now()) / MS_PER_DAY)
      : null;
    return { ...contract, daysToExpiry };
  }

  private async findContract(funderId: string, contractId: string) {
    const contract = await this.prisma.funderContract.findFirst({
      where: { id: contractId, funderId, deletedAt: null },
    });
    if (!contract) throw new NotFoundException('Contrato não encontrado');
    return contract;
  }

  async getContracts(funderId: string) {
    await this.findOne(funderId);
    const contracts = await this.prisma.read.funderContract.findMany({
      where: { funderId, deletedAt: null },
      orderBy: [{ endDate: 'asc' }, { createdAt: 'desc' }],
      include: {
        grant: { select: { code: true, title: true } },
        responsible: { select: { fullName: true } },
        funderContact: { select: { firstName: true, lastName: true } },
      },
    });
    return contracts.map(c => this.withContractExpiry(c));
  }

  async addContract(funderId: string, dto: CreateFunderContractDto, userId: number) {
    await this.findOne(funderId);
    this.assertDateRange(dto.startDate, dto.endDate);
    this.assertDateRange(dto.signedAt, dto.endDate);
    await this.assertGrantOfFunder(funderId, dto.grantId);
    await this.assertContactOfFunder(funderId, dto.funderContactId);
    await this.assertUserExists(dto.responsibleId);
    const { signedAt, startDate, endDate, ...rest } = dto;
    const contract = await this.prisma.funderContract.create({
      data: {
        ...rest,
        ...(signedAt && { signedAt: new Date(signedAt) }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        funderId,
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'FunderContract', contract.id, {
      funderId,
      type: dto.type,
    });
    return this.withContractExpiry(contract);
  }

  async updateContract(
    funderId: string,
    contractId: string,
    dto: UpdateFunderContractDto,
    userId: number,
  ) {
    const current = await this.findContract(funderId, contractId);
    const endDate = dto.endDate ?? current.endDate;
    this.assertDateRange(dto.startDate ?? current.startDate, endDate);
    this.assertDateRange(dto.signedAt ?? current.signedAt, endDate);
    await this.assertGrantOfFunder(funderId, dto.grantId);
    await this.assertContactOfFunder(funderId, dto.funderContactId);
    await this.assertUserExists(dto.responsibleId);
    const { signedAt, startDate, endDate: end, ...rest } = dto;
    const updated = await this.prisma.funderContract.update({
      where: { id: contractId },
      data: {
        ...rest,
        ...(signedAt && { signedAt: new Date(signedAt) }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(end && { endDate: new Date(end) }),
      },
    });
    await this.audit.logEntity(userId, 'UPDATE', 'FunderContract', contractId, dto);
    return this.withContractExpiry(updated);
  }

  async removeContract(funderId: string, contractId: string, userId: number) {
    await this.findContract(funderId, contractId);
    await this.prisma.funderContract.update({
      where: { id: contractId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'FunderContract', contractId, { funderId });
    return { message: 'Contrato removido com sucesso' };
  }

  // ─── REQUISITOS DE REPORTE (⑪) ───────────────────────

  /** Um relatório por submeter cujo prazo passou está em atraso. */
  private withOverdue<T extends { status: string; dueDate: Date }>(report: T) {
    const isOverdue =
      (report.status === 'PENDING' || report.status === 'REJECTED') &&
      report.dueDate.getTime() < Date.now();
    return { ...report, isOverdue };
  }

  /** O próximo prazo do financiador é sempre o do relatório pendente mais próximo. */
  private async syncNextReportDue(funderId: string) {
    const next = await this.prisma.funderReport.findFirst({
      where: { funderId, deletedAt: null, status: { in: ['PENDING', 'REJECTED'] } },
      orderBy: { dueDate: 'asc' },
      select: { dueDate: true },
    });
    await this.prisma.funder.update({
      where: { id: funderId },
      data: { nextReportDue: next?.dueDate ?? null },
    });
  }

  private async findReport(funderId: string, reportId: string) {
    const report = await this.prisma.funderReport.findFirst({
      where: { id: reportId, funderId, deletedAt: null },
    });
    if (!report) throw new NotFoundException('Relatório não encontrado');
    return report;
  }

  async getReports(funderId: string, filters: FilterFunderReportDto) {
    await this.findOne(funderId);
    const { type, status, grantId } = filters;
    const reports = await this.prisma.read.funderReport.findMany({
      where: {
        funderId,
        deletedAt: null,
        ...(type && { type }),
        ...(status && { status }),
        ...(grantId && { grantId }),
      },
      orderBy: { dueDate: 'asc' },
      include: {
        grant: { select: { code: true, title: true } },
        responsible: { select: { fullName: true } },
      },
    });
    return reports.map(r => this.withOverdue(r));
  }

  async createReport(funderId: string, dto: CreateFunderReportDto, userId: number) {
    await this.findOne(funderId);
    await this.assertGrantOfFunder(funderId, dto.grantId);
    await this.assertUserExists(dto.responsibleId);
    const { dueDate, ...rest } = dto;
    const report = await this.prisma.funderReport.create({
      data: {
        ...rest,
        dueDate: new Date(dueDate),
        funderId,
        createdById: userId,
      },
    });
    await this.syncNextReportDue(funderId);
    await this.audit.logEntity(userId, 'CREATE', 'FunderReport', report.id, {
      funderId,
      period: dto.period,
      type: report.type,
    });
    return this.withOverdue(report);
  }

  async updateReport(
    funderId: string,
    reportId: string,
    dto: UpdateFunderReportDto,
    userId: number,
  ) {
    const current = await this.findReport(funderId, reportId);
    await this.assertGrantOfFunder(funderId, dto.grantId);
    await this.assertUserExists(dto.responsibleId);
    const { dueDate, submittedAt, ...rest } = dto;
    // Marcar como submetido/aprovado sem data de submissão assume agora
    const reachedSubmission = dto.status === 'SUBMITTED' || dto.status === 'APPROVED';
    const resolvedSubmittedAt =
      submittedAt ?? (reachedSubmission && !current.submittedAt ? new Date() : undefined);
    const updated = await this.prisma.funderReport.update({
      where: { id: reportId },
      data: {
        ...rest,
        ...(dueDate && { dueDate: new Date(dueDate) }),
        ...(resolvedSubmittedAt && { submittedAt: new Date(resolvedSubmittedAt) }),
      },
    });
    await this.syncNextReportDue(funderId);
    await this.audit.logEntity(userId, 'UPDATE', 'FunderReport', reportId, dto);
    return this.withOverdue(updated);
  }

  async removeReport(funderId: string, reportId: string, userId: number) {
    await this.findReport(funderId, reportId);
    await this.prisma.funderReport.update({
      where: { id: reportId },
      data: { deletedAt: new Date() },
    });
    await this.syncNextReportDue(funderId);
    await this.audit.logEntity(userId, 'DELETE', 'FunderReport', reportId, { funderId });
    return { message: 'Relatório removido com sucesso' };
  }

  async submitReport(reportId: string, fileUrl: string, userId: number) {
    const report = await this.prisma.funderReport.findUnique({
      where: { id: reportId },
    });
    if (!report || report.deletedAt) throw new NotFoundException('Relatório não encontrado');
    const updated = await this.prisma.funderReport.update({
      where: { id: reportId },
      data: { status: 'SUBMITTED', submittedAt: new Date(), fileUrl },
    });
    await this.syncNextReportDue(report.funderId);
    await this.audit.logEntity(userId, 'UPDATE', 'FunderReport', reportId, {
      status: 'SUBMITTED',
    });
    return updated;
  }

  // ─── INDICADORES E IMPACTO (⑫) ───────────────────────

  private async findIndicator(funderId: string, indicatorId: string) {
    const indicator = await this.prisma.funderIndicator.findFirst({
      where: { id: indicatorId, funderId, deletedAt: null },
    });
    if (!indicator) throw new NotFoundException('Indicador não encontrado');
    return indicator;
  }

  /** Cada indicador padrão só existe uma vez por âmbito (financiador/programa/financiamento). */
  private async assertIndicatorUnique(
    funderId: string,
    scope: { key: FunderIndicatorKey; programId?: string | null; grantId?: string | null },
    excludeId?: string,
  ) {
    if (scope.key === 'CUSTOM') return;
    const clash = await this.prisma.funderIndicator.findFirst({
      where: {
        funderId,
        key: scope.key,
        programId: scope.programId ?? null,
        grantId: scope.grantId ?? null,
        deletedAt: null,
        ...(excludeId && { id: { not: excludeId } }),
      },
      select: { id: true },
    });
    if (clash) throw new BadRequestException('Este indicador já está configurado para o âmbito');
  }

  /** Percentagem de cumprimento da meta (null sem meta definida). */
  private withProgress<T extends { target: number | null; achieved: number }>(indicator: T) {
    const progress =
      indicator.target && indicator.target > 0
        ? (indicator.achieved / indicator.target) * 100
        : null;
    return { ...indicator, progress };
  }

  async getIndicators(funderId: string, filters: FilterFunderIndicatorDto) {
    await this.findOne(funderId);
    const { programId, grantId } = filters;
    const indicators = await this.prisma.read.funderIndicator.findMany({
      where: {
        funderId,
        deletedAt: null,
        ...(programId && { programId }),
        ...(grantId && { grantId }),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        program: { select: { program: true, project: true } },
        grant: { select: { code: true, title: true } },
      },
    });
    return indicators.map(i => this.withProgress(i));
  }

  async addIndicator(funderId: string, dto: CreateFunderIndicatorDto, userId: number) {
    await this.findOne(funderId);
    await this.assertProgramOfFunder(funderId, dto.programId);
    await this.assertGrantOfFunder(funderId, dto.grantId);
    await this.assertIndicatorUnique(funderId, dto);
    const indicator = await this.prisma.funderIndicator.create({
      data: { ...dto, funderId },
    });
    await this.audit.logEntity(userId, 'CREATE', 'FunderIndicator', indicator.id, {
      funderId,
      key: dto.key,
    });
    return this.withProgress(indicator);
  }

  async updateIndicator(
    funderId: string,
    indicatorId: string,
    dto: UpdateFunderIndicatorDto,
    userId: number,
  ) {
    const current = await this.findIndicator(funderId, indicatorId);
    await this.assertProgramOfFunder(funderId, dto.programId);
    await this.assertGrantOfFunder(funderId, dto.grantId);
    await this.assertIndicatorUnique(
      funderId,
      {
        key: dto.key ?? current.key,
        programId: dto.programId ?? current.programId,
        grantId: dto.grantId ?? current.grantId,
      },
      indicatorId,
    );
    const updated = await this.prisma.funderIndicator.update({
      where: { id: indicatorId },
      data: dto,
    });
    await this.audit.logEntity(userId, 'UPDATE', 'FunderIndicator', indicatorId, dto);
    return this.withProgress(updated);
  }

  async removeIndicator(funderId: string, indicatorId: string, userId: number) {
    await this.findIndicator(funderId, indicatorId);
    await this.prisma.funderIndicator.update({
      where: { id: indicatorId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'FunderIndicator', indicatorId, { funderId });
    return { message: 'Indicador removido com sucesso' };
  }

  /** Impacto consolidado: soma de metas e resultados por tipo de indicador. */
  async getImpactSummary(funderId: string) {
    await this.findOne(funderId);
    const rows = await this.prisma.read.funderIndicator.groupBy({
      by: ['key'],
      where: { funderId, deletedAt: null },
      _sum: { target: true, achieved: true },
      _count: { id: true },
    });
    return rows.map(r => {
      const target = r._sum.target ?? 0;
      const achieved = r._sum.achieved ?? 0;
      return {
        key: r.key,
        indicators: r._count.id,
        target,
        achieved,
        progress: target > 0 ? (achieved / target) * 100 : null,
      };
    });
  }

  // ─── ACTIVIDADES E RELACIONAMENTO (⑮) ────────────────
  // Timeline de interacções. lastContactAt / nextContactAt / satisfactionAvg do
  // financiador são sempre recalculados a partir das interacções (nunca ficam
  // presos ao último valor escrito). nextReportDue pertence aos relatórios (§11).

  private async refreshInteractionStats(funderId: string) {
    const now = new Date();
    const [last, next, ratings] = await Promise.all([
      this.prisma.funderInteraction.findFirst({
        where: { funderId, deletedAt: null, date: { lte: now } },
        orderBy: { date: 'desc' },
        select: { date: true },
      }),
      this.prisma.funderInteraction.findFirst({
        where: { funderId, deletedAt: null, nextDate: { gte: now } },
        orderBy: { nextDate: 'asc' },
        select: { nextDate: true },
      }),
      this.prisma.funderInteraction.aggregate({
        where: { funderId, deletedAt: null, satisfaction: { not: null } },
        _avg: { satisfaction: true },
      }),
    ]);
    await this.prisma.funder.update({
      where: { id: funderId },
      data: {
        lastContactAt: last?.date ?? null,
        nextContactAt: next?.nextDate ?? null,
        satisfactionAvg: ratings._avg.satisfaction ?? 0,
      },
    });
  }

  private async findInteraction(funderId: string, interactionId: string) {
    const interaction = await this.prisma.funderInteraction.findFirst({
      where: { id: interactionId, funderId, deletedAt: null },
    });
    if (!interaction) throw new NotFoundException('Actividade não encontrada');
    return interaction;
  }

  async getInteractions(
    funderId: string,
    filters: FilterFunderInteractionDto,
    viewer: { id: number; isAdmin: boolean },
  ) {
    await this.findOne(funderId);
    const { type, grantId, responsibleId, from, to, page = 1, limit = DEFAULT_PAGE_SIZE } = filters;
    const { skip, take } = calculatePagination(page, limit);
    const where: Prisma.FunderInteractionWhereInput = {
      funderId,
      deletedAt: null,
      // Notas privadas só são visíveis a quem as registou (e a ADMIN)
      ...(!viewer.isAdmin && { OR: [{ isPrivate: false }, { userId: viewer.id }] }),
      ...(type && { type }),
      ...(grantId && { grantId }),
      ...(responsibleId && { responsibleId }),
      ...((from || to) && {
        date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) },
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.read.funderInteraction.findMany({
        where,
        skip,
        take,
        orderBy: { date: 'desc' },
        include: {
          user: { select: { id: true, fullName: true } },
          responsible: { select: { id: true, fullName: true } },
          grant: { select: { code: true, title: true } },
        },
      }),
      this.prisma.read.funderInteraction.count({ where }),
    ]);
    return buildPaginatedResponse(data, total, page, limit);
  }

  async addInteraction(funderId: string, dto: CreateFunderInteractionDto, userId: number) {
    await this.findOne(funderId);
    await this.assertGrantOfFunder(funderId, dto.grantId);
    await this.assertUserExists(dto.responsibleId);
    const { date, nextDate, ...rest } = dto;
    const interaction = await this.prisma.funderInteraction.create({
      data: {
        ...rest,
        ...(date && { date: new Date(date) }),
        ...(nextDate && { nextDate: new Date(nextDate) }),
        funderId,
        userId,
      },
      include: {
        user: { select: { fullName: true } },
        responsible: { select: { id: true, fullName: true } },
      },
    });
    await this.refreshInteractionStats(funderId);
    await this.audit.logEntity(userId, 'CREATE', 'FunderInteraction', interaction.id, {
      funderId,
    });
    return interaction;
  }

  async updateInteraction(
    funderId: string,
    interactionId: string,
    dto: UpdateFunderInteractionDto,
    userId: number,
  ) {
    await this.findInteraction(funderId, interactionId);
    await this.assertGrantOfFunder(funderId, dto.grantId);
    await this.assertUserExists(dto.responsibleId);
    const { date, nextDate, ...rest } = dto;
    const updated = await this.prisma.funderInteraction.update({
      where: { id: interactionId },
      data: {
        ...rest,
        ...(date && { date: new Date(date) }),
        ...(nextDate && { nextDate: new Date(nextDate) }),
      },
      include: { responsible: { select: { id: true, fullName: true } } },
    });
    await this.refreshInteractionStats(funderId);
    await this.audit.logEntity(userId, 'UPDATE', 'FunderInteraction', interactionId, dto);
    return updated;
  }

  async removeInteraction(funderId: string, interactionId: string, userId: number) {
    await this.findInteraction(funderId, interactionId);
    await this.prisma.funderInteraction.update({
      where: { id: interactionId },
      data: { deletedAt: new Date() },
    });
    await this.refreshInteractionStats(funderId);
    await this.audit.logEntity(userId, 'DELETE', 'FunderInteraction', interactionId, { funderId });
    return { message: 'Actividade removida com sucesso' };
  }

  // ─── BENEFICIÁRIOS FINANCIADOS (⑬) ────────────────────
  // Financiador → Programa → Projecto → Beneficiários. Só leitura: cruza os
  // programas do financiador com as participações já registadas em
  // CRM → Beneficiários. O beneficiário nunca é duplicado.

  private participationWhereForProgram(p: {
    program: string;
    project: string | null;
  }): Prisma.BeneficiaryParticipationWhereInput {
    return {
      program: { equals: p.program.trim(), mode: 'insensitive' },
      // Linha com projecto só conta participações desse projecto; sem projecto, o programa todo
      ...(p.project && { project: { equals: p.project.trim(), mode: 'insensitive' } }),
    };
  }

  async getBeneficiariesSummary(funderId: string) {
    await this.findOne(funderId);
    const rows = await this.prisma.read.funderProgram.findMany({
      where: { funderId, deletedAt: null },
      select: { id: true, program: true, project: true, expectedBeneficiaries: true },
      orderBy: { createdAt: 'asc' },
    });

    const entries = await Promise.all(
      rows.map(async row => {
        const distinct = await this.prisma.read.beneficiaryParticipation.findMany({
          where: {
            deletedAt: null,
            beneficiary: { deletedAt: null },
            ...this.participationWhereForProgram(row),
          },
          distinct: ['beneficiaryId'],
          select: { beneficiaryId: true },
        });
        return { row, ids: distinct.map(d => d.beneficiaryId) };
      }),
    );

    // Programa (nome, case-insensitive) → projectos. O total do programa não soma duas
    // vezes o mesmo beneficiário inscrito em vários projectos.
    const programs = new Map<
      string,
      { program: string; ids: Set<string>; expected: number; projects: unknown[] }
    >();
    for (const { row, ids } of entries) {
      const key = row.program.trim().toLowerCase();
      const node = programs.get(key) ?? {
        program: row.program.trim(),
        ids: new Set<string>(),
        expected: 0,
        projects: [],
      };
      ids.forEach(id => node.ids.add(id));
      node.expected += row.expectedBeneficiaries ?? 0;
      node.projects.push({
        programId: row.id,
        project: row.project,
        expectedBeneficiaries: row.expectedBeneficiaries,
        beneficiaries: ids.length,
      });
      programs.set(key, node);
    }

    const all = new Set<string>();
    entries.forEach(e => e.ids.forEach(id => all.add(id)));
    return {
      totalBeneficiaries: all.size,
      programs: [...programs.values()].map(n => ({
        program: n.program,
        expectedBeneficiaries: n.expected,
        beneficiaries: n.ids.size,
        projects: n.projects,
      })),
    };
  }

  async getFundedBeneficiaries(
    funderId: string,
    filters: FilterFunderBeneficiaryDto,
    pagination: PaginationFilterDto,
  ) {
    await this.findOne(funderId);
    const page = pagination.page ?? 1;
    const limit = Math.min(pagination.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const { skip, take } = calculatePagination(page, limit);
    const rows = await this.prisma.read.funderProgram.findMany({
      where: { funderId, deletedAt: null },
      select: { program: true, project: true },
    });
    const norm = (v?: string | null) => v?.trim().toLowerCase();
    const matching = rows.filter(
      r =>
        (!filters.program || norm(r.program) === norm(filters.program)) &&
        (!filters.project || norm(r.project) === norm(filters.project)),
    );
    if (!matching.length) return buildPaginatedResponse([], 0, page, limit);
    const where: Prisma.BeneficiaryParticipationWhereInput = {
      deletedAt: null,
      beneficiary: { deletedAt: null },
      OR: matching.map(r => this.participationWhereForProgram(r)),
    };
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

  // ─── PARCEIROS ASSOCIADOS (⑭) ─────────────────────────
  // Financiador ↔ Parceiro ↔ Programa/Projecto. Usa a mesma PartnerFunderLink
  // que o separador "Financiamento" do parceiro: criar de um lado aparece no outro.

  private async findPartnerLink(funderId: string, linkId: string) {
    const link = await this.prisma.partnerFunderLink.findFirst({
      where: { id: linkId, funderId, deletedAt: null },
    });
    if (!link) throw new NotFoundException('Parceiro associado não encontrado');
    return link;
  }

  async getPartners(funderId: string) {
    await this.findOne(funderId);
    const links = await this.prisma.read.partnerFunderLink.findMany({
      where: { funderId, deletedAt: null, partner: { deletedAt: null } },
      orderBy: { createdAt: 'desc' },
      include: {
        partner: { select: { id: true, code: true, name: true, type: true, status: true } },
        program: { select: { id: true, program: true, project: true } },
      },
    });
    // Vista por programa: quem co-financia/implementa cada programa (consórcios)
    const byProgram = new Map<string, { program: unknown; partners: unknown[] }>();
    for (const l of links) {
      const key = l.programId ?? 'none';
      const node = byProgram.get(key) ?? { program: l.program, partners: [] };
      node.partners.push({
        linkId: l.id,
        partner: l.partner,
        relationType: l.relationType,
        amountFunded: l.amountFunded,
        currency: l.currency,
      });
      byProgram.set(key, node);
    }
    return { links, byProgram: [...byProgram.values()] };
  }

  async addPartner(funderId: string, dto: CreateFunderPartnerLinkDto, userId: number) {
    await this.findOne(funderId);
    this.assertDateRange(dto.periodStart, dto.periodEnd);
    await this.assertProgramOfFunder(funderId, dto.programId);
    const partner = await this.prisma.partner.findFirst({
      where: { id: dto.partnerId, deletedAt: null },
      select: { id: true },
    });
    if (!partner) throw new BadRequestException('Parceiro não encontrado');
    const duplicate = await this.prisma.partnerFunderLink.findFirst({
      where: {
        funderId,
        partnerId: dto.partnerId,
        programId: dto.programId ?? null,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('Este parceiro já está associado ao financiador/programa');
    }
    const { periodStart, periodEnd, ...rest } = dto;
    const link = await this.prisma.$transaction(async tx => {
      // Ter um financiador associado implica que o parceiro exerce o papel de financiador
      await tx.partner.update({ where: { id: dto.partnerId }, data: { isFunder: true } });
      return tx.partnerFunderLink.create({
        data: {
          ...rest,
          ...(periodStart && { periodStart: new Date(periodStart) }),
          ...(periodEnd && { periodEnd: new Date(periodEnd) }),
          funderId,
        },
        include: {
          partner: { select: { id: true, code: true, name: true } },
          program: { select: { id: true, program: true, project: true } },
        },
      });
    });
    await this.audit.logEntity(userId, 'CREATE', 'PartnerFunderLink', link.id, {
      funderId,
      partnerId: dto.partnerId,
    });
    return link;
  }

  async updatePartner(
    funderId: string,
    linkId: string,
    dto: UpdateFunderPartnerLinkDto,
    userId: number,
  ) {
    const current = await this.findPartnerLink(funderId, linkId);
    await this.assertProgramOfFunder(funderId, dto.programId);
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

  async removePartner(funderId: string, linkId: string, userId: number) {
    await this.findPartnerLink(funderId, linkId);
    await this.prisma.partnerFunderLink.update({
      where: { id: linkId },
      data: { deletedAt: new Date() },
    });
    await this.audit.logEntity(userId, 'DELETE', 'PartnerFunderLink', linkId, { funderId });
    return { message: 'Parceiro desassociado com sucesso' };
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
        where: { status: { in: EXECUTING_GRANT_STATUSES }, deletedAt: null },
      }),
      this.prisma.read.fundingGrant.aggregate({
        _sum: { disbursed: true },
        where: { status: { in: EXECUTING_GRANT_STATUSES }, deletedAt: null },
      }),
      this.prisma.read.fundingGrant.count({
        where: { status: { in: EXECUTING_GRANT_STATUSES }, deletedAt: null },
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
        where: { createdAt: { gte: startOfMonth }, deletedAt: null, status: 'RECEIVED' },
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
        where: { receivedAt: range, status: 'RECEIVED', deletedAt: null },
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
