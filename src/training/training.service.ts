import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateTrainingDto, UpdateTrainingDto, CreateTrainingSessionDto,
  RegisterParticipantDto, UpdateParticipantStatusDto, TrainingFilterDto,
} from './trainings.dto';

@Injectable()
export class TrainingService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters: TrainingFilterDto) {
    const { page = 1, limit = 20, search, instructorId } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search)       where.title        = { contains: search, mode: 'insensitive' };
    if (instructorId) where.instructorId = instructorId;

    const [data, total] = await Promise.all([
      this.prisma.training.findMany({
        where, skip, take: limit,
        include: {
          instructor: { select: { id: true, fullName: true } },
          _count:     { select: { sessions: true } },
        },
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.training.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const t = await this.prisma.training.findUnique({
      where: { id },
      include: {
        instructor: { select: { id: true, fullName: true, email: true } },
        sessions: {
          include: {
            participants: {
              include: { user: { select: { id: true, fullName: true } } },
            },
          },
          orderBy: { sessionDate: 'asc' },
        },
      },
    });
    if (!t) throw new NotFoundException('Treinamento não encontrado');
    return t;
  }

  async create(dto: CreateTrainingDto) {
    return this.prisma.training.create({
      data: {
        title:        dto.title,
        description:  dto.description,
        startDate:    new Date(dto.startDate),
        endDate:      new Date(dto.endDate),
        // ← corrigido: removido 'location' — campo não existe no modelo Training
        instructorId: dto.instructorId,
        type:         dto.type  ?? 'PRESENCIAL',
        level:        dto.level ?? 'BASICO',
      },
      include: { instructor: { select: { id: true, fullName: true } } },
    });
  }

  async update(id: number, dto: UpdateTrainingDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.startDate) data.startDate = new Date(dto.startDate);
    if (dto.endDate)   data.endDate   = new Date(dto.endDate);
    delete data.location; // ← garantir que location não entra no update
    return this.prisma.training.update({ where: { id }, data });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.training.delete({ where: { id } });
    return { message: 'Treinamento removido' };
  }

  async createSession(dto: CreateTrainingSessionDto) {
    return this.prisma.trainingSession.create({
      data: {
        trainingId:      dto.trainingId,
        sessionDate:     new Date(dto.sessionDate),
        durationMinutes: dto.duration,
        modality:        'PRESENCIAL',
      },
    });
  }

  async removeSession(id: number) {
    await this.prisma.trainingSession.delete({ where: { id } });
    return { message: 'Sessão removida' };
  }

  async registerParticipant(dto: RegisterParticipantDto) {
    return this.prisma.trainingParticipant.upsert({
      where:  { id: 0 },
      create: { sessionId: dto.sessionId, userId: dto.userId, status: 'registered' },
      update: { status: 'registered' },
    }).catch(() =>
      this.prisma.trainingParticipant.create({
        data: { sessionId: dto.sessionId, userId: dto.userId, status: 'registered' },
      }),
    );
  }

  async updateParticipantStatus(id: number, dto: UpdateParticipantStatusDto) {
    return this.prisma.trainingParticipant.update({
      where: { id }, data: { status: dto.status },
    });
  }

  async removeParticipant(id: number) {
    await this.prisma.trainingParticipant.delete({ where: { id } });
    return { message: 'Participante removido' };
  }

  async getSessionParticipants(sessionId: number) {
    return this.prisma.trainingParticipant.findMany({
      where:   { sessionId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getMyTrainings(userId: number) {
    return this.prisma.trainingParticipant.findMany({
      where: { userId },
      include: {
        session: {
          include: {
            training: {
              include: { instructor: { select: { id: true, fullName: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAttendanceReport(trainingId: number) {
    const training = await this.findOne(trainingId);
    const report   = training.sessions.map(session => {
      const total    = session.participants.length;
      const attended = session.participants.filter(p => p.status === 'attended').length;
      return {
        sessionId:       session.id,
        sessionDate:     session.sessionDate,
        duration:        session.durationMinutes,
        totalRegistered: total,
        attended,
        attendanceRate:  total > 0 ? Math.round((attended / total) * 100) : 0,
        participants:    session.participants,
      };
    });
    return { trainingId, title: training.title, sessions: report };
  }
}