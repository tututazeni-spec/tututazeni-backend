import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateYearDto,
  CreatePeriodDto,
  CreateProgramDto,
  CreateClassDto,
  CreateEnrollmentDto,
  GradeEnrollmentDto,
  FilterProgramDto,
} from './dto';
import { AuditService } from '../common/services/audit.service';

@Injectable()
export class AcademicService {
  constructor(
    private prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ─── ANOS LECTIVOS ───────────────────────────────────

  async createYear(dto: CreateYearDto, userId: number) {
    if (dto.isCurrent) {
      await this.prisma.academicYear.updateMany({
        where: { isCurrent: true, deletedAt: null },
        data: { isCurrent: false },
      });
    }
    const { startDate, endDate, ...rest } = dto;
    const year = await this.prisma.academicYear.create({
      data: {
        ...rest,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        createdById: userId,
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'AcademicYear', year.id, {
      name: dto.name,
    });
    return year;
  }

  async getCurrentYear() {
    return this.prisma.read.academicYear.findFirst({
      where: { isCurrent: true, deletedAt: null },
      include: { periods: { where: { deletedAt: null } } },
    });
  }

  async findAllYears() {
    return this.prisma.read.academicYear.findMany({
      where: { deletedAt: null },
      orderBy: { startDate: 'desc' },
      include: {
        _count: { select: { periods: true, programs: true } },
      },
    });
  }

  // ─── PERÍODOS ────────────────────────────────────────

  async createPeriod(dto: CreatePeriodDto, userId: number) {
    const year = await this.prisma.read.academicYear.findUnique({
      where: { id: dto.yearId },
    });
    if (!year) throw new NotFoundException('Ano lectivo não encontrado');
    const { startDate, endDate, enrollmentStart, enrollmentEnd, ...rest } = dto;
    const period = await this.prisma.academicPeriod.create({
      data: {
        ...rest,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        ...(enrollmentStart && { enrollmentStart: new Date(enrollmentStart) }),
        ...(enrollmentEnd && { enrollmentEnd: new Date(enrollmentEnd) }),
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'AcademicPeriod', period.id, {
      name: dto.name,
    });
    return period;
  }

  // ─── PROGRAMAS ───────────────────────────────────────

  async createProgram(dto: CreateProgramDto, userId: number) {
    const existing = await this.prisma.academicProgram.findUnique({
      where: { code: dto.code },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`Código ${dto.code} já existe`);
    }
    const program = await this.prisma.academicProgram.create({
      data: { ...dto, createdById: userId },
    });
    await this.audit.logEntity(userId, 'CREATE', 'AcademicProgram', program.id, {
      code: dto.code,
    });
    return program;
  }

  async findAllPrograms(filters: FilterProgramDto) {
    const { level, category, search, isMandatory, page = 1, limit = 20 } = filters;
    const where: any = {
      deletedAt: null,
      isActive: true,
      ...(level && { level }),
      ...(category && { category }),
      ...(isMandatory !== undefined && { isMandatory }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await Promise.all([
      this.prisma.read.academicProgram.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { fullName: true } },
          _count: { select: { enrollments: true, classes: true } },
        },
      }),
      this.prisma.read.academicProgram.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findProgramById(id: string) {
    const program = await this.prisma.read.academicProgram.findUnique({
      where: { id },
      include: {
        createdBy: { select: { fullName: true } },
        classes: {
          where: { deletedAt: null, status: { not: 'CANCELLED' } },
          include: {
            instructor: { select: { fullName: true } },
            _count: { select: { enrollments: true } },
          },
        },
        _count: { select: { enrollments: true } },
      },
    });
    if (!program || program.deletedAt) throw new NotFoundException('Programa não encontrado');
    return program;
  }

  // ─── TURMAS ──────────────────────────────────────────

  async createClass(dto: CreateClassDto, userId: number) {
    const program = await this.prisma.read.academicProgram.findUnique({
      where: { id: dto.programId },
    });
    if (!program) throw new NotFoundException('Programa não encontrado');
    const { startDate, endDate, ...rest } = dto;
    const academicClass = await this.prisma.academicClass.create({
      data: {
        ...rest,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'AcademicClass', academicClass.id, {
      name: dto.name,
    });
    return academicClass;
  }

  // ─── MATRÍCULAS ──────────────────────────────────────

  private async generateEnrollmentCode(): Promise<string> {
    const last = await this.prisma.academicEnrollment.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('MAT-', ''), 10) + 1 : 1;
    return `MAT-${String(num).padStart(5, '0')}`;
  }

  async enroll(dto: CreateEnrollmentDto, userId: number) {
    const program = await this.prisma.read.academicProgram.findUnique({
      where: { id: dto.programId },
    });
    if (!program) throw new NotFoundException('Programa não encontrado');

    // Verifica pré-requisitos
    if (program.prerequisites?.length) {
      const completed = await this.prisma.read.academicEnrollment.count({
        where: {
          userId: dto.userId,
          programId: { in: program.prerequisites },
          status: 'COMPLETED',
        },
      });
      if (completed < program.prerequisites.length) {
        throw new BadRequestException('Pré-requisitos não concluídos');
      }
    }

    // Verifica duplicado
    const existing = await this.prisma.academicEnrollment.findFirst({
      where: {
        userId: dto.userId,
        programId: dto.programId,
        status: { notIn: ['DROPPED', 'FAILED', 'REJECTED'] },
        deletedAt: null,
      },
    });
    if (existing) throw new ConflictException('Já matriculado neste programa');

    // Verifica vagas na turma
    if (dto.classId) {
      const cls = await this.prisma.read.academicClass.findUnique({
        where: { id: dto.classId },
        include: { _count: { select: { enrollments: true } } },
      });
      if (cls?.maxStudents && cls._count.enrollments >= cls.maxStudents) {
        throw new BadRequestException('Turma sem vagas disponíveis');
      }
    }

    const code = await this.generateEnrollmentCode();
    const enrollment = await this.prisma.academicEnrollment.create({
      data: {
        code,
        userId: dto.userId,
        programId: dto.programId,
        classId: dto.classId,
        periodId: dto.periodId,
        status: program.isMandatory ? 'APPROVED' : 'PENDING',
        startDate: new Date(),
      },
    });
    await this.audit.logEntity(userId, 'CREATE', 'AcademicEnrollment', enrollment.id, {
      code,
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: dto.userId,
        type: 'ACADEMIC_ENROLLMENT',
        title: 'Matrícula académica',
        message: `Matrícula em "${program.name}" ${
          enrollment.status === 'APPROVED' ? 'aprovada' : 'pendente'
        }.`,
        metadata: JSON.stringify({
          enrollmentId: enrollment.id,
          programId: dto.programId,
        }),
      },
    });
    return enrollment;
  }

  async approveEnrollment(id: string, approverId: number) {
    const enrollment = await this.prisma.read.academicEnrollment.findUnique({
      where: { id },
      include: { program: true },
    });
    if (!enrollment) throw new NotFoundException('Matrícula não encontrada');
    if (enrollment.status !== 'PENDING') {
      throw new BadRequestException('Matrícula não está pendente');
    }
    const updated = await this.prisma.academicEnrollment.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: approverId,
        approvedAt: new Date(),
      },
    });
    await this.audit.logEntity(approverId, 'UPDATE', 'AcademicEnrollment', id, {
      status: 'APPROVED',
    });
    await this.prisma.notificationLog.create({
      data: {
        userId: enrollment.userId,
        type: 'ACADEMIC_ENROLLMENT_APPROVED',
        title: 'Matrícula aprovada',
        message: `A tua matrícula em "${enrollment.program.name}" foi aprovada.`,
        metadata: JSON.stringify({ enrollmentId: id }),
      },
    });
    return updated;
  }

  async getMyEnrollments(userId: number, page = 1, limit = 20) {
    const where = { userId, deletedAt: null };
    const [data, total] = await Promise.all([
      this.prisma.read.academicEnrollment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          program: {
            select: {
              name: true,
              code: true,
              level: true,
              durationHours: true,
            },
          },
          class: { select: { name: true, modality: true } },
        },
      }),
      this.prisma.read.academicEnrollment.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── NOTAS ───────────────────────────────────────────

  async gradeEnrollment(dto: GradeEnrollmentDto, graderId: number) {
    const enrollment = await this.prisma.read.academicEnrollment.findUnique({
      where: { id: dto.enrollmentId },
      include: { program: true },
    });
    if (!enrollment) throw new NotFoundException('Matrícula não encontrada');

    const grade = await this.prisma.academicGrade.create({
      data: {
        enrollmentId: dto.enrollmentId,
        courseId: dto.courseId,
        courseName: dto.courseName,
        score: dto.score,
        maxScore: dto.maxScore || 100,
        weight: dto.weight || 1,
        notes: dto.notes,
        gradedById: graderId,
      },
    });

    // Recalcula nota final ponderada
    const allGrades = await this.prisma.read.academicGrade.findMany({
      where: { enrollmentId: dto.enrollmentId },
    });
    const totalWeight = allGrades.reduce((s, g) => s + g.weight, 0);
    const weightedScore = allGrades.reduce((s, g) => s + (g.score / g.maxScore) * g.weight, 0);
    const finalScore = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 1000) / 10 : 0;
    const passed = finalScore >= enrollment.program.passingScore;

    await this.prisma.academicEnrollment.update({
      where: { id: dto.enrollmentId },
      data: {
        finalScore,
        status: passed ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: passed ? new Date() : null,
        progress: passed ? 100 : Math.min(95, allGrades.length * 20),
      },
    });

    await this.updateTranscript(enrollment.userId);
    await this.audit.logEntity(graderId, 'CREATE', 'AcademicGrade', grade.id, {
      enrollmentId: dto.enrollmentId,
      score: dto.score,
    });
    return grade;
  }

  async getEnrollmentGrades(enrollmentId: string) {
    return this.prisma.read.academicGrade.findMany({
      where: { enrollmentId },
      orderBy: { gradedAt: 'desc' },
      include: { gradedBy: { select: { fullName: true } } },
    });
  }

  // ─── TRANSCRIÇÃO ─────────────────────────────────────

  async getTranscript(userId: number) {
    const [transcript, enrollments] = await Promise.all([
      this.prisma.read.academicTranscript.findUnique({ where: { userId } }),
      this.prisma.read.academicEnrollment.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          program: {
            select: {
              name: true,
              code: true,
              durationHours: true,
              level: true,
            },
          },
          grades: true,
        },
      }),
    ]);
    return { transcript, enrollments };
  }

  // ─── RELATÓRIO ───────────────────────────────────────

  async getAcademicReport() {
    const [totalPrograms, totalEnrollments, completed, inProgress, pending, avgScore, byLevel] =
      await Promise.all([
        this.prisma.read.academicProgram.count({
          where: { deletedAt: null, isActive: true },
        }),
        this.prisma.read.academicEnrollment.count({ where: { deletedAt: null } }),
        this.prisma.read.academicEnrollment.count({ where: { status: 'COMPLETED' } }),
        this.prisma.read.academicEnrollment.count({ where: { status: 'IN_PROGRESS' } }),
        this.prisma.read.academicEnrollment.count({ where: { status: 'PENDING' } }),
        this.prisma.read.academicEnrollment.aggregate({
          _avg: { finalScore: true },
          where: { finalScore: { not: null } },
        }),
        (this.prisma.read.academicProgram.groupBy as any)({
          by: ['level'],
          where: { deletedAt: null },
          _count: { id: true },
        }),
      ]);
    return {
      totalPrograms,
      totalEnrollments,
      completed,
      inProgress,
      pending,
      completionRate: totalEnrollments > 0 ? (completed / totalEnrollments) * 100 : 0,
      averageScore: avgScore._avg.finalScore || 0,
      byLevel,
    };
  }

  // ─── HELPERS ─────────────────────────────────────────

  private async updateTranscript(userId: number) {
    const enrollments = await this.prisma.read.academicEnrollment.findMany({
      where: { userId, deletedAt: null },
      include: { program: { select: { durationHours: true } } },
    });
    const completed = enrollments.filter(e => e.status === 'COMPLETED');
    const inProgress = enrollments.filter(e => e.status === 'IN_PROGRESS');
    const totalHours = completed.reduce((s, e) => s + (e.program.durationHours || 0), 0);
    const scores = completed.filter(e => e.finalScore).map(e => e.finalScore!);
    const gpa =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : 0;

    await this.prisma.academicTranscript.upsert({
      where: { userId },
      update: {
        gpa,
        totalHours,
        completedPrograms: completed.length,
        inProgressPrograms: inProgress.length,
      },
      create: {
        userId,
        gpa,
        totalHours,
        completedPrograms: completed.length,
        inProgressPrograms: inProgress.length,
      },
    });
  }
}
