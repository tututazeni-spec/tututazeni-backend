import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MobileSyncStatus } from '@prisma/client';

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

  // Atualizar token push — com verificação atomic de propriedade (IDOR fix)
  async updatePushToken(sessionId: number, pushToken: string, userId: number) {
    const result = await this.prisma.mobileSession.updateMany({
      where: { id: sessionId, userId },
      data: { pushToken },
    });
    if (result.count === 0) throw new NotFoundException('Sessão não encontrada');
    return { updated: true };
  }

  // Registrar sincronização
  async logSync(userId: number, entity: string, status: MobileSyncStatus) {
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
    const enrollments = await (this.prisma as any).read.enrollment.findMany({
      where: { userId },
    });

    const evaluations = await (this.prisma as any).read.evaluationAttempt.findMany({
      where: { enrollment: { userId } },
    });

    return {
      enrollments,
      evaluations,
    };
  }
}
