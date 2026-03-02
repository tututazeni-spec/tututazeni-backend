import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class CareerService {
  constructor(private prisma: PrismaService) {}

  // Criar cargo
  createPosition(data: Prisma.CareerPositionCreateInput) {
    return this.prisma.careerPosition.create({ data });
  }

  // Criar competência
  createCompetency(data: Prisma.CompetencyCreateInput) {
    return this.prisma.competency.create({ data });
  }

  // Associar competência ao cargo
  addCompetencyToPosition(data: Prisma.PositionCompetencyCreateInput) {
    return this.prisma.positionCompetency.create({ data });
  }

  // Atribuir cargo ao usuário
  assignPositionToUser(data: Prisma.UserCareerCreateInput) {
    return this.prisma.userCareer.create({ data });
  }

  // Histórico de carreira do usuário
  getUserCareerHistory(userId: number) {
    return this.prisma.userCareer.findMany({
      where: { userId },
      include: {
        position: {
          include: {
            competencies: {
              include: { competency: true },
            },
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  // Listar cargos
  listPositions() {
    return this.prisma.careerPosition.findMany({
      include: {
        competencies: {
          include: { competency: true },
        },
      },
    });
  }
}