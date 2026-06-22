import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLiveClassDto,
  UpdateLiveClassDto,
  LiveChatMessageDto,
  PostClassResponseDto,
  LiveClassFilterDto,
} from './live-classes.dto';

@Injectable()
export class LiveClassesService {
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private prisma: PrismaService) {}

  async findAll(filters: LiveClassFilterDto) {
    const { page = 1, limit = 20, courseId } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (courseId) where.courseId = courseId;

    const [data, total] = await Promise.all([
      this.prismaRead.liveClass.findMany({
        where,
        skip,
        take: limit,
        include: {
          course: { select: { id: true, title: true } },
          _count: { select: { attendances: true, messages: true } },
          postEvaluation: true,
        },
        orderBy: { scheduledAt: 'desc' },
      }),
      this.prismaRead.liveClass.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: number) {
    const lc = await this.prismaRead.liveClass.findUnique({
      where: { id },
      include: {
        course: { select: { id: true, title: true } },
        attendances: { include: { user: { select: { id: true, fullName: true } } } },
        messages: {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
        postEvaluation: { include: { responses: true } },
      },
    });
    if (!lc) throw new NotFoundException('Aula ao vivo não encontrada');
    return lc;
  }

  async create(dto: CreateLiveClassDto) {
    return this.prisma.liveClass.create({
      data: { ...dto, scheduledAt: new Date(dto.scheduledAt) },
      include: { course: { select: { id: true, title: true } } },
    });
  }

  async update(id: number, dto: UpdateLiveClassDto) {
    await this.findOne(id);
    const data: any = { ...dto };
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    return this.prisma.liveClass.update({ where: { id }, data });
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.liveClass.delete({ where: { id } });
    return { message: 'Aula removida' };
  }

  async joinClass(liveClassId: number, userId: number) {
    const existing = await this.prismaRead.liveAttendance.findUnique({
      where: { liveClassId_userId: { liveClassId, userId } },
    });
    if (existing) {
      return this.prisma.liveAttendance.update({
        where: { liveClassId_userId: { liveClassId, userId } },
        data: { joinedAt: new Date(), leftAt: null },
      });
    }
    return this.prisma.liveAttendance.create({
      data: { liveClassId, userId, joinedAt: new Date() },
    });
  }

  async leaveClass(liveClassId: number, userId: number) {
    return this.prisma.liveAttendance.update({
      where: { liveClassId_userId: { liveClassId, userId } },
      data: { leftAt: new Date() },
    });
  }

  async sendMessage(liveClassId: number, userId: number, dto: LiveChatMessageDto) {
    return this.prisma.liveChatMessage.create({
      data: { liveClassId, userId, message: dto.message },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  async getMessages(liveClassId: number, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    return this.prismaRead.liveChatMessage.findMany({
      where: { liveClassId },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'asc' },
      skip,
      take: limit,
    });
  }

  async createPostEvaluation(liveClassId: number) {
    const exists = await this.prismaRead.postClassEvaluation.findUnique({ where: { liveClassId } });
    if (exists) throw new ConflictException('Avaliação pós-aula já criada');
    return this.prisma.postClassEvaluation.create({
      data: { liveClassId },
    });
  }

  async submitPostResponse(userId: number, dto: PostClassResponseDto) {
    const evaluation = await this.prismaRead.postClassEvaluation.findUnique({
      where: { id: dto.evaluationId },
    });
    if (!evaluation) throw new NotFoundException('Avaliação não encontrada');

    const response = await this.prisma.postClassResponse.upsert({
      where: { evaluationId_userId: { evaluationId: dto.evaluationId, userId } },
      create: {
        evaluationId: dto.evaluationId,
        userId,
        rating: dto.rating,
        feedback: dto.feedback,
      },
      update: { rating: dto.rating, feedback: dto.feedback },
    });

    const avg = await this.prismaRead.postClassResponse.aggregate({
      where: { evaluationId: dto.evaluationId },
      _avg: { rating: true },
    });
    await this.prisma.postClassEvaluation.update({
      where: { id: dto.evaluationId },
      data: { averageScore: avg._avg.rating ?? 0 },
    });

    return response;
  }

  async getAttendanceReport(liveClassId: number) {
    const attendances = await this.prismaRead.liveAttendance.findMany({
      where: { liveClassId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
    return attendances.map(a => {
      const durationMin = a.leftAt
        ? Math.round((a.leftAt.getTime() - a.joinedAt.getTime()) / 60000)
        : null;
      return { ...a, durationMinutes: durationMin };
    });
  }

  async getUpcoming() {
    return this.prismaRead.liveClass.findMany({
      where: { scheduledAt: { gte: new Date() } },
      include: {
        course: { select: { id: true, title: true } },
        _count: { select: { attendances: true } },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 10,
    });
  }
}
