import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/decorators';
import { buildPaginatedResponse, calculatePagination } from '../common/helpers/pagination.helper';
import { normalizeSupportPage } from './support.page';
import { CreateTicketDto, ReplyTicketDto, TicketQueryDto } from './support.dto';
import {
  FIRST_RESPONSE_BUSINESS_HOURS,
  firstResponseDueAt,
  isOverdue,
  SupportStatus,
} from './support.sla';

const STAFF_ROLES = ['ADMIN', 'RH'];

export function isSupportStaff(user: CurrentUserData): boolean {
  return STAFF_ROLES.includes(user.role?.name ?? '');
}

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  // Canais e tempos de resposta, para a página de Ajuda ser a única fonte do que é prometido.
  channels() {
    return {
      email: process.env.SUPPORT_EMAIL || null,
      hours: 'Segunda a sexta, 08:00–18:00 (hora de Luanda)',
      responseTargets: Object.entries(FIRST_RESPONSE_BUSINESS_HOURS).map(
        ([priority, businessHours]) => ({
          priority,
          businessHours,
        }),
      ),
      statusPageUrl: process.env.STATUS_PAGE_URL || null,
    };
  }

  async create(user: CurrentUserData, dto: CreateTicketDto) {
    const now = new Date();
    const ticket = await this.prisma.supportTicket.create({
      data: {
        requesterId: user.id,
        subject: dto.subject.trim(),
        description: dto.description.trim(),
        category: dto.category,
        priority: dto.priority,
        page: normalizeSupportPage(dto.page),
        firstResponseDueAt: firstResponseDueAt(dto.priority, now),
      },
    });
    return ticket;
  }

  async mine(user: CurrentUserData, q: TicketQueryDto) {
    const where = { requesterId: user.id, ...(q.status ? { status: q.status } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        ...calculatePagination(q.page, q.limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return buildPaginatedResponse(rows, total, q.page, q.limit);
  }

  async queue(q: TicketQueryDto) {
    const where = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        ...calculatePagination(q.page, q.limit),
        orderBy: [{ firstResponseDueAt: 'asc' }],
        include: { requester: { select: { id: true, fullName: true, email: true } } },
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    const data = rows.map(t => ({ ...t, overdue: isOverdue(t) }));
    return buildPaginatedResponse(data, total, q.page, q.limit);
  }

  async get(user: CurrentUserData, id: number) {
    const staff = isSupportStaff(user);
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, fullName: true, email: true } },
        messages: {
          where: staff ? {} : { internal: false },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, fullName: true } } },
        },
      },
    });
    // 404 também para quem não é dono: não revela a existência de pedidos alheios.
    if (!ticket || (!staff && ticket.requesterId !== user.id)) {
      throw new NotFoundException('Pedido não encontrado');
    }
    return { ...ticket, overdue: isOverdue(ticket) };
  }

  async reply(user: CurrentUserData, id: number, dto: ReplyTicketDto) {
    const staff = isSupportStaff(user);
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket || (!staff && ticket.requesterId !== user.id)) {
      throw new NotFoundException('Pedido não encontrado');
    }
    if (dto.internal && !staff)
      throw new ForbiddenException('Só o suporte pode criar notas internas');
    if (ticket.status === 'CLOSED') {
      throw new ForbiddenException('Este pedido está fechado. Abra um novo pedido.');
    }

    const now = new Date();
    const publicStaffReply = staff && !dto.internal;
    const nextStatus: SupportStatus | undefined = publicStaffReply
      ? ticket.status === 'OPEN'
        ? 'IN_PROGRESS'
        : undefined
      : !staff && (ticket.status === 'WAITING_CUSTOMER' || ticket.status === 'RESOLVED')
        ? 'OPEN'
        : undefined;

    const [message] = await this.prisma.$transaction([
      this.prisma.supportTicketMessage.create({
        data: {
          ticketId: id,
          authorId: user.id,
          body: dto.body.trim(),
          staff,
          internal: !!dto.internal,
        },
      }),
      this.prisma.supportTicket.update({
        where: { id },
        data: {
          ...(publicStaffReply && !ticket.firstRespondedAt ? { firstRespondedAt: now } : {}),
          ...(nextStatus ? { status: nextStatus } : {}),
          ...(nextStatus === 'OPEN' ? { resolvedAt: null } : {}),
        },
      }),
    ]);
    return message;
  }

  async setStatus(id: number, status: SupportStatus) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Pedido não encontrado');
    return this.prisma.supportTicket.update({
      where: { id },
      data: {
        status,
        resolvedAt:
          status === 'RESOLVED' || status === 'CLOSED' ? (ticket.resolvedAt ?? new Date()) : null,
      },
    });
  }

  async summary() {
    const open = { status: { notIn: ['RESOLVED', 'CLOSED'] } };
    const [byStatus, openTickets, answered] = await Promise.all([
      this.prisma.supportTicket.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.supportTicket.findMany({
        where: { ...open, firstRespondedAt: null },
        select: { firstRespondedAt: true, firstResponseDueAt: true, status: true },
      }),
      this.prisma.supportTicket.findMany({
        where: { firstRespondedAt: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { createdAt: true, firstRespondedAt: true, firstResponseDueAt: true },
      }),
    ]);
    const withinTarget = answered.filter(t => t.firstRespondedAt! <= t.firstResponseDueAt).length;
    return {
      byStatus: Object.fromEntries(byStatus.map(s => [s.status, s._count._all])),
      overdue: openTickets.filter(t => isOverdue(t)).length,
      awaitingFirstResponse: openTickets.length,
      answeredWithinTargetPct: answered.length
        ? Math.round((withinTarget / answered.length) * 100)
        : null,
      sampleSize: answered.length,
    };
  }
}
