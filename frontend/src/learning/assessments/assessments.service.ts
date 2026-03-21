import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AssessmentsService {
  constructor(private prisma: PrismaService) {}

  create(data: any) {
    return this.prisma.assessment.create({ data });
  }

  findByCourse(courseId: number) {
    return this.prisma.assessment.findMany({
      where: { courseId },
      include: { questions: true },
    });
  }

  submitAttempt(data: any) {
    return this.prisma.assessmentAttempt.create({ data });
  }
}
