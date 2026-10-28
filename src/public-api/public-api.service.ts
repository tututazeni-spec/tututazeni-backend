import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { buildPaginatedResponse, calculatePagination } from '../common/helpers/pagination.helper';
import { PublicEnrollDto } from './public-api.dto';

@Injectable()
export class PublicApiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  async employees(page: number, limit: number) {
    const where = { active: true };
    const [rows, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        ...calculatePagination(page, limit),
        orderBy: { id: 'asc' },
        select: { id: true, fullName: true, email: true, employeeNumber: true, createdAt: true },
      }),
      this.prisma.user.count({ where }),
    ]);
    return buildPaginatedResponse(rows, total, page, limit);
  }

  async courses(page: number, limit: number) {
    const where = { status: 'PUBLISHED' as const };
    const [rows, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        ...calculatePagination(page, limit),
        orderBy: { id: 'asc' },
        select: { id: true, title: true, description: true, status: true },
      }),
      this.prisma.course.count({ where }),
    ]);
    return buildPaginatedResponse(rows, total, page, limit);
  }

  async courseEnrollments(courseId: number, page: number, limit: number) {
    const where = { courseId };
    const [rows, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where,
        ...calculatePagination(page, limit),
        orderBy: { id: 'asc' },
        select: {
          id: true,
          userId: true,
          courseId: true,
          status: true,
          enrolledAt: true,
          completedAt: true,
        },
      }),
      this.prisma.enrollment.count({ where }),
    ]);
    return buildPaginatedResponse(rows, total, page, limit);
  }

  async enroll(dto: PublicEnrollDto) {
    const e = await this.enrollments.enroll({
      userId: dto.userId,
      courseId: dto.courseId,
      origin: 'MANUAL',
    });
    return { id: e.id, userId: e.userId, courseId: e.courseId, status: e.status };
  }
}
