import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  courseReport(courseId: number) {
    return this.prisma.enrollment.findMany({
      where: { courseId },
      include: { user: true },
    });
  }
}
