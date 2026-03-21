import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LearningPathsService {
  constructor(private prisma: PrismaService) {}

  create(data: any) {
    return this.prisma.learningPath.create({ data });
  }

  addCourse(pathId: number, courseId: number, seq: number) {
    return this.prisma.learningPathCourse.create({
      data: { learningPathId: pathId, courseId, seq },
    });
  }

  findAll() {
    return this.prisma.learningPath.findMany({
      include: { courses: true },
    });
  }
}
