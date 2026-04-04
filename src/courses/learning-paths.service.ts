import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLearningPathDto, UpdateLearningPathDto, AssignLearningPathDto } from './learning-paths.dto';
 
@Injectable()
export class LearningPathsService {
  constructor(private prisma: PrismaService) {}
 
  async findAll() {
    return this.prisma.learningPath.findMany({
      include: {
        courses: { include: { course: true }, orderBy: { seq: 'asc' } },
        _count: { select: { assignments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
 
  async findOne(id: number) {
    const lp = await this.prisma.learningPath.findUnique({
      where: { id },
      include: {
        courses: { include: { course: { include: { modules: true } } }, orderBy: { seq: 'asc' } },
        assignments: { include: { unit: true } },
      },
    });
    if (!lp) throw new NotFoundException('Trilha de aprendizagem não encontrada');
    return lp;
  }
 
  async create(dto: CreateLearningPathDto) {
    const { courseIds, ...data } = dto;
    const lp = await this.prisma.learningPath.create({ data });
 
    if (courseIds?.length) {
      await this.prisma.learningPathCourse.createMany({
        data: courseIds.map((courseId, seq) => ({ learningPathId: lp.id, courseId, seq })),
      });
    }
    return this.findOne(lp.id);
  }
 
  async update(id: number, dto: UpdateLearningPathDto) {
    await this.findOne(id);
    const { courseIds, ...data } = dto;
    if (courseIds) {
      await this.prisma.learningPathCourse.deleteMany({ where: { learningPathId: id } });
      await this.prisma.learningPathCourse.createMany({
        data: courseIds.map((courseId, seq) => ({ learningPathId: id, courseId, seq })),
      });
    }
    return this.prisma.learningPath.update({ where: { id }, data });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.learningPath.delete({ where: { id } });
    return { message: 'Trilha removida' };
  }
 
  async addCourse(learningPathId: number, courseId: number, seq: number) {
    return this.prisma.learningPathCourse.upsert({
      where: { learningPathId_courseId: { learningPathId, courseId } },
      create: { learningPathId, courseId, seq },
      update: { seq },
    });
  }
 
  async removeCourse(learningPathId: number, courseId: number) {
    return this.prisma.learningPathCourse.deleteMany({ where: { learningPathId, courseId } });
  }
 
  async assign(dto: AssignLearningPathDto) {
    return this.prisma.learningPathAssignment.create({
      data: {
        learningPathId: dto.learningPathId,
        unitId: dto.unitId,
        role: dto.role as any,
      },
    });
  }
 
  async getAssignments(learningPathId: number) {
    return this.prisma.learningPathAssignment.findMany({
      where: { learningPathId },
      include: { unit: true },
    });
  }
 
  async enrollUsersFromAssignment(assignmentId: number) {
    const assignment = await this.prisma.learningPathAssignment.findUnique({
      where: { id: assignmentId },
      include: { learningPath: { include: { courses: true } } },
    });
    if (!assignment) throw new NotFoundException('Atribuição não encontrada');
 
    const where: any = {};
    if (assignment.unitId) where.unitId = assignment.unitId;
    if (assignment.role) where.role = { name: assignment.role };
 
    const users = await this.prisma.user.findMany({ where, select: { id: true } });
    const courses = assignment.learningPath.courses;
 
    let enrolled = 0;
    for (const user of users) {
      for (const lpc of courses) {
        const exists = await this.prisma.enrollment.findFirst({
          where: { userId: user.id, courseId: lpc.courseId, status: { not: 'CANCELADO' } },
        });
        if (!exists) {
          await this.prisma.enrollment.create({
            data: { userId: user.id, courseId: lpc.courseId },
          });
          enrolled++;
        }
      }
    }
    return { enrolled, users: users.length, courses: courses.length };
  }
}
 
