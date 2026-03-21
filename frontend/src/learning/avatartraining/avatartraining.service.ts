import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AvatarTrainingService {
  constructor(private prisma: PrismaService) {}

  createScript(data: any) {
    return this.prisma.avatarScript.create({ data });
  }

  findAll() {
    return this.prisma.avatarScript.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
