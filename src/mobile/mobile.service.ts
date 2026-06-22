import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MobileService {
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(private prisma: PrismaService) {}

  // Registrar sessão mobile
  async registerSession(userId: number, deviceId: string, platform: string, pushToken?: string) {
    return this.prisma.mobileSession.create({
      data: {
        userId,
        deviceId,
        platform,
        pushToken,
      },
    });
  }

  // Atualizar token push
  async updatePushToken(sessionId: number, pushToken: string) {
    return this.prisma.mobileSession.update({
      where: { id: sessionId },
      data: { pushToken },
    });
  }

  // Registrar sincronização
  async logSync(userId: number, entity: string, status: 'SUCCESS' | 'FAILED') {
    return this.prisma.mobileSyncLog.create({
      data: {
        userId,
        entity,
        status,
      },
    });
  }

  // Obter dados mobile para dashboard simplificado
  async getUserMobileDashboard(userId: number) {
    const enrollments = await this.prismaRead.enrollment.findMany({
      where: { userId },
      include: { course: true, certificate: true },
    });

    const evaluations = await this.prismaRead.evaluationAttempt.findMany({
      where: { enrollment: { userId } },
    });

    return {
      enrollments,
      evaluations,
    };
  }
}
