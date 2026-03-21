import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class TrainingService {
  constructor(private prisma: PrismaService) {}

  // Treinamento
  createTraining(data: Prisma.TrainingCreateInput) {
    return this.prisma.training.create({ data });
  }

  findAllTrainings() {
    return this.prisma.training.findMany({
      include: { sessions: { include: { participants: true } }, instructor: true },
    });
  }

  findTraining(id: number) {
    return this.prisma.training.findUnique({
      where: { id },
      include: { sessions: { include: { participants: true } }, instructor: true },
    });
  }

  // Sessões
  createSession(data: Prisma.TrainingSessionCreateInput) {
    return this.prisma.trainingSession.create({ data });
  }

  findSessionsByTraining(trainingId: number) {
    return this.prisma.trainingSession.findMany({
      where: { trainingId },
      include: { participants: { include: { user: true } } },
      orderBy: { sessionDate: 'asc' },
    });
  }

  // Participantes
  addParticipant(data: Prisma.TrainingParticipantCreateInput) {
    return this.prisma.trainingParticipant.create({ data });
  }

  updateParticipantStatus(id: number, status: string) {
    return this.prisma.trainingParticipant.update({
      where: { id },
      data: { status },
    });
  }
}