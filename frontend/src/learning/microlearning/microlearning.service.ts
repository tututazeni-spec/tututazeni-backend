import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MicroLearningService {
  constructor(private prisma: PrismaService) {}

  create(data: any) {
    return this.prisma.microLearning.create({ data });
  }

  dispatchToUser(microLearningId: number, userId: number) {
    return this.prisma.microLearningDispatch.create({
      data: { microLearningId, userId },
    });
  }

  markAsViewed(dispatchId: number) {
    return this.prisma.microLearningDispatch.update({
      where: { id: dispatchId },
      data: { viewed: true },
    });
  }
}
