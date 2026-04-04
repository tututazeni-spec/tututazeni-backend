import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCourseDto, UpdateCourseDto, CourseFilterDto, CourseFeedbackDto,
} from './courses.dto';
 
const COURSE_INCLUDE = {
  modules: { include: { lessons: true }, orderBy: { seq: 'asc' as const } },
  competencies: { include: { competency: true } },
  _count: { select: { enrollments: true, feedbacks: true } },
};
 
@Injectable()
export class CoursesService {
  constructor(private prisma: PrismaService) {}
 
  async findAll(filters: CourseFilterDto) {
    const { page = 1, limit = 20, search, category, mandatory, active } = filters;
    const skip = (page - 1) * limit;
    const where: any = {};
    if (search) where.title = { contains: search, mode: 'insensitive' };
    if (category) where.category = category;
    if (mandatory !== undefined) where.mandatory = mandatory;
    if (active !== undefined) where.active = active;
 
    const [data, total] = await Promise.all([
      this.prisma.course.findMany({
        where, skip, take: limit,
        include: {
          _count: { select: { enrollments: true, feedbacks: true } },
          competencies: { include: { competency: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.course.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number) {
    const course = await this.prisma.course.findUnique({
      where: { id },
      include: {
        ...COURSE_INCLUDE,
        analytics: true,
        feedbacks: {
          include: { user: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!course) throw new NotFoundException('Curso não encontrado');
    return course;
  }
 
  async create(dto: CreateCourseDto) {
    const course = await this.prisma.course.create({ data: dto });
    await this.prisma.courseAnalytics.create({
      data: { courseId: course.id, totalEnrollments: 0, totalCompleted: 0 },
    });
    return course;
  }
 
  async update(id: number, dto: UpdateCourseDto) {
    await this.findOne(id);
    return this.prisma.course.update({ where: { id }, data: dto });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.course.delete({ where: { id } });
    return { message: 'Curso removido' };
  }
 
  async toggleActive(id: number) {
    const course = await this.findOne(id);
    return this.prisma.course.update({
      where: { id }, data: { active: !course.active },
    });
  }
 
  async addCompetency(courseId: number, competencyId: number) {
    return this.prisma.courseCompetency.create({ data: { courseId, competencyId } });
  }
 
  async removeCompetency(courseId: number, competencyId: number) {
    return this.prisma.courseCompetency.deleteMany({ where: { courseId, competencyId } });
  }
 
  async addFeedback(courseId: number, userId: number, dto: CourseFeedbackDto) {
    await this.findOne(courseId);
    const feedback = await this.prisma.courseFeedback.create({
      data: { courseId, userId, comment: dto.comment, rating: dto.rating },
    });
    // Atualizar analytics
    const avg = await this.prisma.courseFeedback.aggregate({
      where: { courseId }, _avg: { rating: true },
    });
    return { feedback, averageRating: avg._avg.rating ?? 0 };
  }
 
  async getCourseAnalytics(courseId: number) {
    await this.findOne(courseId);
    const [analytics, enrollmentsByStatus, feedbackStats, recentActivity] = await Promise.all([
      this.prisma.courseAnalytics.findFirst({ where: { courseId } }),
      this.prisma.enrollment.groupBy({
        by: ['status'], where: { courseId }, _count: true,
      }),
      this.prisma.courseFeedback.aggregate({
        where: { courseId }, _avg: { rating: true }, _count: true,
      }),
      this.prisma.enrollment.findMany({
        where: { courseId },
        include: { user: { select: { id: true, fullName: true } } },
        orderBy: { enrolledAt: 'desc' }, take: 10,
      }),
    ]);
    return { analytics, enrollmentsByStatus, feedbackStats, recentActivity };
  }
 
  async getCategories() {
    const cats = await this.prisma.course.findMany({
      where: { category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    });
    return cats.map(c => c.category).filter(Boolean);
  }
}
