import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEnrollmentDto, UpdateEnrollmentStatusDto,
  EnrollmentFilterDto, BulkEnrollDto,
} from './enrollments.dto';
 
@Injectable()
export class EnrollmentsService {
  constructor(private prisma: PrismaService) {}
 
  async findAll(filters: EnrollmentFilterDto) {
    const { page = 1, limit = 20, userId, courseId, status } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (userId) where.userId = userId;
    if (courseId) where.courseId = courseId;
    if (status) where.status = status;
 
    const [data, total] = await Promise.all([
      this.prisma.enrollment.findMany({
        where, skip, take: limit,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          course: { select: { id: true, title: true, workloadHours: true } },
          certificate: true,
          _count: { select: { progresses: true } },
        },
        orderBy: { enrolledAt: 'desc' },
      }),
      this.prisma.enrollment.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number) {
    const e = await this.prisma.enrollment.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        course: { include: { modules: { include: { lessons: true }, orderBy: { seq: 'asc' } } } },
        progresses: { include: { lesson: true } },
        certificate: true,
        attempts: { include: { evaluation: true }, orderBy: { attemptedAt: 'desc' } },
      },
    });
    if (!e) throw new NotFoundException('Matrícula não encontrada');
 
    const allLessons = e.course.modules.flatMap(m => m.lessons);
    const completedCount = e.progresses.filter(p => p.completed).length;
    const progressPercent = allLessons.length
      ? Math.round((completedCount / allLessons.length) * 100)
      : 0;
 
    return { ...e, progressPercent, completedLessons: completedCount, totalLessons: allLessons.length };
  }
 
  async enroll(dto: CreateEnrollmentDto) {
    const exists = await this.prisma.enrollment.findFirst({
      where: { userId: dto.userId, courseId: dto.courseId, status: { not: 'CANCELADO' } },
    });
    if (exists) throw new ConflictException('Utilizador já matriculado neste curso');
 
    const enrollment = await this.prisma.enrollment.create({
      data: { userId: dto.userId, courseId: dto.courseId },
      include: { course: true, user: { select: { id: true, fullName: true } } },
    });
 
    await this.prisma.courseAnalytics.updateMany({
      where: { courseId: dto.courseId },
      data: { totalEnrollments: { increment: 1 } },
    });
 
    await this.prisma.notificationLog.create({
      data: {
        userId: dto.userId,
        type: 'ENROLLMENT',
        message: `Matriculado no curso: ${enrollment.course.title}`,
        success: true,
      },
    });
 
    return enrollment;
  }
 
  async bulkEnroll(dto: BulkEnrollDto) {
    const results = await Promise.allSettled(
      dto.userIds.map(userId => this.enroll({ userId, courseId: dto.courseId })),
    );
    return {
      success: results.filter(r => r.status === 'fulfilled').length,
      errors: results.filter(r => r.status === 'rejected').length,
    };
  }
 
  async updateStatus(id: number, dto: UpdateEnrollmentStatusDto) {
    await this.findOne(id);
    return this.prisma.enrollment.update({
      where: { id }, data: { status: dto.status },
    });
  }
 
  async cancel(id: number) {
    return this.updateStatus(id, { status: 'CANCELADO' } as any);
  }
 
  async getUserEnrollments(userId: number) {
    return this.prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: { select: { id: true, title: true, category: true, workloadHours: true } },
        progresses: { where: { completed: true }, select: { id: true } },
        certificate: true,
      },
      orderBy: { enrolledAt: 'desc' },
    });
  }
 
  async generateCertificate(enrollmentId: number) {
    const enrollment = await this.findOne(enrollmentId);
    if (enrollment.status !== 'CONCLUIDO') {
      throw new ConflictException('Curso ainda não concluído');
    }
    const exists = await this.prisma.certificate.findUnique({ where: { enrollmentId } });
    if (exists) return exists;
 
    const code = `CERT-${Date.now()}-${enrollmentId}`;
    return this.prisma.certificate.create({
      data: {
        enrollmentId,
        type: 'COURSE',
        validationCode: code,
        fileUrl: `/certificates/${code}.pdf`,
      },
    });
  }
}
 
