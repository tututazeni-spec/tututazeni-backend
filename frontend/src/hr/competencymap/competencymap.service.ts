import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompetencyMapService {
  constructor(private prisma: PrismaService) {}

  createCompetency(data: any) {
    return this.prisma.competency.create({ data });
  }

  assignToCourse(courseId: number, competencyId: number) {
    return this.prisma.courseCompetency.create({
      data: { courseId, competencyId },
    });
  }
}