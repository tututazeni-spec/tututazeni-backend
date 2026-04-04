// ─── leadership.service.ts ───────────────────────────────────────────────────
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLeadershipProgramDto, UpdateLeadershipProgramDto,
  EnrollLeadershipDto, UpdateParticipantProgressDto,
} from './leadership.dto';
 
@Injectable()
export class LeadershipService {
  constructor(private prisma: PrismaService) {}
 
  async findAll() {
    return this.prisma.leadershipProgram.findMany({
      include: {
        _count: { select: { participants: true, certificates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
 
  async findOne(id: number) {
    const p = await this.prisma.leadershipProgram.findUnique({
      where: { id },
      include: {
        participants: {
          include: { user: { select: { id: true, fullName: true, email: true } } },
          orderBy: { enrolledAt: 'desc' },
        },
        certificates: true,
      },
    });
    if (!p) throw new NotFoundException('Programa de liderança não encontrado');
    return p;
  }
 
  async create(dto: CreateLeadershipProgramDto) {
    return this.prisma.leadershipProgram.create({ data: dto });
  }
 
  async update(id: number, dto: UpdateLeadershipProgramDto) {
    await this.findOne(id);
    return this.prisma.leadershipProgram.update({ where: { id }, data: dto });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.leadershipProgram.delete({ where: { id } });
    return { message: 'Programa removido' };
  }
 
  async enroll(dto: EnrollLeadershipDto) {
    const exists = await this.prisma.leadershipParticipant.findUnique({
      where: { userId_programId: { userId: dto.userId, programId: dto.programId } },
    });
    if (exists) throw new ConflictException('Utilizador já inscrito neste programa');
    return this.prisma.leadershipParticipant.create({
      data: { userId: dto.userId, programId: dto.programId },
      include: { user: { select: { id: true, fullName: true } }, program: true },
    });
  }
 
  async updateProgress(userId: number, programId: number, dto: UpdateParticipantProgressDto) {
    const participant = await this.prisma.leadershipParticipant.findUnique({
      where: { userId_programId: { userId, programId } },
    });
    if (!participant) throw new NotFoundException('Participante não encontrado');
 
    const updated = await this.prisma.leadershipParticipant.update({
      where: { userId_programId: { userId, programId } },
      data: { progress: dto.progress, status: dto.status ?? participant.status },
    });
 
    if (dto.progress >= 100 || dto.status === 'COMPLETED') {
      const code = `LEAD-${Date.now()}-${userId}-${programId}`;
      await this.prisma.certificate.create({
        data: { type: 'LEADERSHIP', programId, validationCode: code, fileUrl: `/certificates/${code}.pdf` },
      });
      await this.prisma.userPoints.upsert({
        where: { userId },
        create: { userId, points: 300 },
        update: { points: { increment: 300 } },
      });
    }
    return updated;
  }
 
  async withdraw(userId: number, programId: number) {
    await this.prisma.leadershipParticipant.update({
      where: { userId_programId: { userId, programId } },
      data: { status: 'WITHDRAWN' },
    });
    return { message: 'Inscrição cancelada' };
  }
 
  async getMyPrograms(userId: number) {
    return this.prisma.leadershipParticipant.findMany({
      where: { userId },
      include: { program: true },
      orderBy: { enrolledAt: 'desc' },
    });
  }
 
  async getProgramStats(programId: number) {
    await this.findOne(programId);
    const [total, completed, avgProgress] = await Promise.all([
      this.prisma.leadershipParticipant.count({ where: { programId } }),
      this.prisma.leadershipParticipant.count({ where: { programId, status: 'COMPLETED' } }),
      this.prisma.leadershipParticipant.aggregate({
        where: { programId }, _avg: { progress: true },
      }),
    ]);
    return {
      programId, total, completed,
      completionRate: total ? Math.round((completed / total) * 100) : 0,
      avgProgress: avgProgress._avg.progress ?? 0,
    };
  }
}
 
