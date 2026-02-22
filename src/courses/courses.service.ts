import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.course.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.course.findUnique({
      where: { id: Number(id) },
      include: {
        modules: {
          orderBy: { seq: 'asc' },
          include: {
            lessons: { orderBy: { seq: 'asc' } },
          },
        },
      },
    });
  }
}
