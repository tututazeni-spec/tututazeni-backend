import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MobileService {
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
    const enrollments = await this.prisma.read.enrollment.findMany({
      where: { userId },
      include: { course: true, certificate: true },
    });

    const evaluations = await this.prisma.read.evaluationAttempt.findMany({
      where: { enrollment: { userId } },
    });

    return {
      enrollments,
      evaluations,
    };
  }
}
