import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LeadershipService {
  constructor(private prisma: PrismaService) {}

  createProgram(data: any) {
    return this.prisma.leadershipProgram.create({ data });
  }

  getPrograms() {
    return this.prisma.leadershipProgram.findMany({
      where: { active: true },
    });
  }

  enrollParticipant(data: any) {
    return this.prisma.leadershipParticipant.create({ data });
  }

  updateProgress(userId: number, programId: number, progress: number) {
    return this.prisma.leadershipParticipant.update({
      where: {
        userId_programId: {
          userId,
          programId,
        },
      },
      data: { progress },
    });
  }

  getParticipants(programId: number) {
    return this.prisma.leadershipParticipant.findMany({
      where: { programId },
      include: { user: true },
    });
  }
}
