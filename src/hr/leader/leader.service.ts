import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LeaderService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(userId: string) {
  const leader = await this.prisma.user.findUnique({
    where: { id: Number(userId) },
    include: { role: true },
  });

  if (!leader?.role || leader.role.name !== 'LIDER') {
    throw new Error('Usuário não é líder');
  }

    const collaborators = await this.prisma.user.findMany({
  where: {
    unitId: leader.unitId,
    role: {
      name: 'COLABORADOR', // ✅ filtra pelo name da relação Role
    },
  },
});

    const collaboratorIds = collaborators.map((c) => c.id);

    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: { in: collaboratorIds } },
    });

    const totalEnrollments = enrollments.length;
    const completed = enrollments.filter((e) => e.status === 'CONCLUIDO')
      .length;

    const completionPercent =
      totalEnrollments > 0
        ? Math.round((completed / totalEnrollments) * 100)
        : 0;

    return {
      collaboratorsCount: collaborators.length,
      totalEnrollments,
      completed,
      completionPercent,
    };
  }
}
