import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  courseStats(courseId: number) {
    return this.prisma.courseAnalytics.findMany({
  where: { courseId },
});
  }
}
