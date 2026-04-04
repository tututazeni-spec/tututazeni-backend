import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateModuleDto, UpdateModuleDto,
  CreateLessonDto, UpdateLessonDto,
  MarkLessonCompleteDto,
} from './course-modules.dto';
 
@Injectable()
export class CourseModulesService {
  constructor(private prisma: PrismaService) {}
 
  // ─── MODULES ──────────────────────────────────────────────────────────────
 
  async createModule(dto: CreateModuleDto) {
    return this.prisma.module.create({ data: dto, include: { lessons: true } });
  }
 
  async updateModule(id: number, dto: UpdateModuleDto) {
    await this.findModuleOrFail(id);
    return this.prisma.module.update({ where: { id }, data: dto });
  }
 
  async deleteModule(id: number) {
    await this.findModuleOrFail(id);
    await this.prisma.module.delete({ where: { id } });
    return { message: 'Módulo removido' };
  }
 
  async reorderModules(courseId: number, order: { id: number; seq: number }[]) {
    await Promise.all(
      order.map(({ id, seq }) => this.prisma.module.update({ where: { id }, data: { seq } })),
    );
    return this.prisma.module.findMany({
      where: { courseId }, orderBy: { seq: 'asc' }, include: { lessons: true },
    });
  }
 
  async findModuleOrFail(id: number) {
    const mod = await this.prisma.module.findUnique({
      where: { id }, include: { lessons: { orderBy: { seq: 'asc' } } },
    });
    if (!mod) throw new NotFoundException('Módulo não encontrado');
    return mod;
  }
 
  // ─── LESSONS ──────────────────────────────────────────────────────────────
 
  async createLesson(dto: CreateLessonDto) {
    return this.prisma.lesson.create({ data: dto });
  }
 
  async updateLesson(id: number, dto: UpdateLessonDto) {
    await this.findLessonOrFail(id);
    return this.prisma.lesson.update({ where: { id }, data: dto });
  }
 
  async deleteLesson(id: number) {
    await this.findLessonOrFail(id);
    await this.prisma.lesson.delete({ where: { id } });
    return { message: 'Lição removida' };
  }
 
  async reorderLessons(moduleId: number, order: { id: number; seq: number }[]) {
    await Promise.all(
      order.map(({ id, seq }) => this.prisma.lesson.update({ where: { id }, data: { seq } })),
    );
    return this.prisma.lesson.findMany({ where: { moduleId }, orderBy: { seq: 'asc' } });
  }
 
  async findLessonOrFail(id: number) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id } });
    if (!lesson) throw new NotFoundException('Lição não encontrada');
    return lesson;
  }
 
  // ─── PROGRESS ─────────────────────────────────────────────────────────────
 
  async markLessonComplete(dto: MarkLessonCompleteDto) {
    const progress = await this.prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: dto.enrollmentId, lessonId: dto.lessonId } },
      create: { enrollmentId: dto.enrollmentId, lessonId: dto.lessonId, completed: true, completedAt: new Date() },
      update: { completed: true, completedAt: new Date() },
    });
 
    // Verificar se o curso foi concluído
    await this.checkCourseCompletion(dto.enrollmentId);
    return progress;
  }
 
  async getLessonProgress(enrollmentId: number) {
    return this.prisma.lessonProgress.findMany({
      where: { enrollmentId },
      include: { lesson: { include: { module: true } } },
    });
  }
 
  private async checkCourseCompletion(enrollmentId: number) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      include: { course: { include: { modules: { include: { lessons: true } } } } },
    });
    if (!enrollment) return;
 
    const allLessons = enrollment.course.modules.flatMap(m => m.lessons);
    const completed = await this.prisma.lessonProgress.count({
      where: { enrollmentId, completed: true },
    });
 
    if (allLessons.length > 0 && completed >= allLessons.length) {
      await this.prisma.enrollment.update({
        where: { id: enrollmentId }, data: { status: 'CONCLUIDO' },
      });
      // Pontuar o utilizador
      await this.prisma.userPoints.upsert({
        where: { userId: enrollment.userId },
        create: { userId: enrollment.userId, points: 100 },
        update: { points: { increment: 100 } },
      });
      // Actualizar analytics
      await this.prisma.courseAnalytics.updateMany({
        where: { courseId: enrollment.courseId },
        data: { totalCompleted: { increment: 1 } },
      });
    }
  }
}
