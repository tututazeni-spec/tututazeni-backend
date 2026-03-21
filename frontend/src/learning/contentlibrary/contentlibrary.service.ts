import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ContentLibraryService {
  constructor(private prisma: PrismaService) {}

  create(data: any) {
    return this.prisma.contentAsset.create({ data });
  }

  findAll() {
    return this.prisma.contentAsset.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
