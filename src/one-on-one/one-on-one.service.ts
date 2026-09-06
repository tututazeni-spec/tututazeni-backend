// src/one-on-one/one-on-one.service.ts
// Dono único de OneOnOneMeeting (Fase G4). engagement, leader e leadership
// delegam a escrita aqui; a autorização (ownership de equipa, etc.) fica nos
// callers, que fazem getOne() → verificam → delegam.
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ScheduleOneOnOneInput {
  hostId: number;
  participantId: number;
  scheduledAt: string | Date;
  durationMinutes?: number;
  agenda?: string;
  meetingUrl?: string;
  recurring?: boolean;
  frequency?: string;
  status?: Prisma.OneOnOneMeetingCreateInput['status'];
}

export interface UpdateOneOnOneInput {
  scheduledAt?: string | Date;
  durationMinutes?: number;
  agenda?: string;
  meetingUrl?: string;
  minutes?: string;
  actionItems?: string;
  nextMeetingDate?: string | Date | null;
  status?: Prisma.OneOnOneMeetingUpdateInput['status'];
  completedAt?: Date;
  recurring?: boolean;
  frequency?: string;
}

export interface CompleteOneOnOneInput {
  minutes?: string;
  actionItems?: string;
  nextMeetingDate?: string | Date | null;
}

const PARTICIPANTS_INCLUDE = {
  host: { select: { id: true, fullName: true, avatarUrl: true } },
  participant: {
    select: { id: true, fullName: true, avatarUrl: true, position: { select: { name: true } } },
  },
} satisfies Prisma.OneOnOneMeetingInclude;

@Injectable()
export class OneOnOneService {
  private readonly logger = new Logger(OneOnOneService.name);

  constructor(private prisma: PrismaService) {}

  async schedule(input: ScheduleOneOnOneInput) {
    return this.prisma.oneOnOneMeeting.create({
      data: {
        hostId: input.hostId,
        participantId: input.participantId,
        scheduledAt: new Date(input.scheduledAt),
        durationMinutes: input.durationMinutes ?? 30,
        agenda: input.agenda,
        meetingUrl: input.meetingUrl,
        recurring: input.recurring ?? false,
        frequency: input.frequency,
        status: input.status ?? 'SCHEDULED',
      },
    });
  }

  async getOne(id: number) {
    const meeting = await this.prisma.read.oneOnOneMeeting.findUnique({ where: { id } });
    if (!meeting) throw new NotFoundException('1:1 não encontrado');
    return meeting;
  }

  async listForUser(userId: number, opts?: { hostOnly?: boolean; otherPartyId?: number }) {
    const where: Prisma.OneOnOneMeetingWhereInput = opts?.hostOnly
      ? { hostId: userId }
      : { OR: [{ hostId: userId }, { participantId: userId }] };
    if (opts?.otherPartyId) {
      where.participantId = opts.otherPartyId;
    }
    return this.prisma.read.oneOnOneMeeting.findMany({
      where,
      include: PARTICIPANTS_INCLUDE,
      orderBy: { scheduledAt: 'desc' },
      take: 50,
    });
  }

  async update(id: number, input: UpdateOneOnOneInput) {
    const data: Prisma.OneOnOneMeetingUpdateInput = {
      durationMinutes: input.durationMinutes,
      agenda: input.agenda,
      meetingUrl: input.meetingUrl,
      minutes: input.minutes,
      actionItems: input.actionItems,
      status: input.status,
      completedAt: input.completedAt,
      recurring: input.recurring,
      frequency: input.frequency,
    };
    if (input.scheduledAt !== undefined) data.scheduledAt = new Date(input.scheduledAt);
    if (input.nextMeetingDate !== undefined) {
      data.nextMeetingDate = input.nextMeetingDate ? new Date(input.nextMeetingDate) : null;
    }
    return this.prisma.oneOnOneMeeting.update({ where: { id }, data });
  }

  async complete(id: number, input: CompleteOneOnOneInput = {}) {
    return this.prisma.oneOnOneMeeting.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        minutes: input.minutes,
        actionItems: input.actionItems,
        nextMeetingDate: input.nextMeetingDate ? new Date(input.nextMeetingDate) : undefined,
      },
    });
  }

  async cancel(id: number) {
    return this.prisma.oneOnOneMeeting.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}
