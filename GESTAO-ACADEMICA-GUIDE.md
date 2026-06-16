# INNOVA — Módulo 7: Sistema de Gestão Académica
> Mesmo padrão dos Módulos 1-6 (o mais complexo: múltiplas entidades interligadas)
> Referência: SAP Education + Blackboard Enterprise + Banner (Ellucian)

---

## ⚠️ REGRAS ABSOLUTAS DO INNOVA

```
- fullName (NUNCA name) — User model
- entity (NUNCA entityType) — AuditLog
- metadata → JSON.stringify()
- deletedAt em TODOS os novos modelos
- auditLog em CREATE, UPDATE, DELETE
- Paginação: { data, total, page, limit, totalPages }
- Backend porta 4000 | Frontend porta 3000
- Angola: dd/MM/yyyy, AOA, UTC+1
```

---

## ARQUITECTURA DO MÓDULO

```
AcademicYear (ano lectivo 2025/2026)
  └── AcademicPeriod (semestres, trimestres)
        └── AcademicProgram (curso/programa estruturado)
              └── AcademicClass (turma específica)
                    └── AcademicEnrollment (matrícula do aluno)
                          └── AcademicGrade (notas por disciplina)

AcademicTranscript (histórico/transcrição do aluno — agregado)
```

---

## CHECKLIST OBRIGATÓRIO

```
□ Schema Prisma (6 modelos + 6 enums) + migrate dev
□ DTOs (year + period + program + class + enrollment + grade + filter)
□ Service completo (gestão de anos/períodos/programas/turmas/matrículas/notas/transcrições)
□ Controller completo (Swagger + Guards + workflow de aprovação)
□ Module registado no AppModule
□ Spec file (10 testes — módulo complexo)
□ Bruno CLI (8 ficheiros .bru — fluxo completo)
□ Frontend page.tsx (programas) + matriculas + notas + transcrição
□ npm run build → 0 erros
□ npm run test → 0 falhas
□ npm run test:cov → > 55%
□ npx bru run bruno/academic/ → passa
□ git commit descritivo
```

---

## PASSO 1 — Schema Prisma

```prisma
# Adicionar a prisma/schema.prisma

model AcademicYear {
  id          String             @id @default(cuid())
  name        String             @unique
  startDate   DateTime
  endDate     DateTime
  isCurrent   Boolean            @default(false)
  status      AcademicYearStatus @default(PLANNING)
  description String?
  createdById String
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt
  deletedAt   DateTime?

  createdBy User             @relation("AcademicYearCreator", fields: [createdById], references: [id])
  periods   AcademicPeriod[]
  programs  AcademicProgram[]

  @@index([isCurrent])
  @@index([status])
  @@index([deletedAt])
}

model AcademicPeriod {
  id              String     @id @default(cuid())
  yearId          String
  name            String
  startDate       DateTime
  endDate         DateTime
  enrollmentStart DateTime?
  enrollmentEnd   DateTime?
  type            PeriodType @default(SEMESTER)
  isActive        Boolean    @default(true)
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
  deletedAt       DateTime?

  year        AcademicYear         @relation(fields: [yearId], references: [id])
  enrollments AcademicEnrollment[]

  @@index([yearId])
  @@index([type])
  @@index([deletedAt])
}

model AcademicProgram {
  id              String       @id @default(cuid())
  code            String       @unique
  name            String
  description     String?
  category        String?
  level           ProgramLevel @default(BASIC)
  durationHours   Int
  maxStudents     Int?
  minStudents     Int?
  passingScore    Float        @default(60)
  certificateType String?
  yearId          String?
  prerequisites   String[]
  courseIds       String[]
  isActive        Boolean      @default(true)
  isMandatory     Boolean      @default(false)
  targetRoles     String[]
  createdById     String
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  deletedAt       DateTime?

  year        AcademicYear?        @relation(fields: [yearId], references: [id])
  createdBy   User                 @relation("AcademicProgramCreator", fields: [createdById], references: [id])
  classes     AcademicClass[]
  enrollments AcademicEnrollment[]

  @@index([code])
  @@index([level])
  @@index([isActive])
  @@index([isMandatory])
  @@index([deletedAt])
}

model AcademicClass {
  id           String        @id @default(cuid())
  programId    String
  name         String
  instructorId String?
  maxStudents  Int?
  startDate    DateTime
  endDate      DateTime
  modality     ClassModality @default(ONLINE)
  location     String?
  schedule     String?
  status       ClassStatus   @default(SCHEDULED)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  deletedAt    DateTime?

  program     AcademicProgram      @relation(fields: [programId], references: [id])
  instructor  User?                @relation("AcademicInstructor", fields: [instructorId], references: [id])
  enrollments AcademicEnrollment[]

  @@index([programId])
  @@index([status])
  @@index([modality])
  @@index([deletedAt])
}

model AcademicEnrollment {
  id           String                   @id @default(cuid())
  code         String                   @unique
  userId       String
  programId    String
  classId      String?
  periodId     String?
  status       AcademicEnrollmentStatus @default(PENDING)
  progress     Float                    @default(0)
  finalScore   Float?
  approvedById String?
  approvedAt   DateTime?
  startDate    DateTime?
  completedAt  DateTime?
  droppedAt    DateTime?
  dropReason   String?
  notes        String?
  createdAt    DateTime                 @default(now())
  updatedAt    DateTime                 @updatedAt
  deletedAt    DateTime?

  user       User            @relation("AcademicStudent",  fields: [userId],     references: [id])
  program    AcademicProgram @relation(fields: [programId], references: [id])
  class      AcademicClass?  @relation(fields: [classId],   references: [id])
  period     AcademicPeriod? @relation(fields: [periodId],  references: [id])
  approvedBy User?           @relation("AcademicApprover",  fields: [approvedById], references: [id])
  grades     AcademicGrade[]

  @@unique([userId, programId, periodId])
  @@index([userId])
  @@index([programId])
  @@index([status])
  @@index([deletedAt])
}

model AcademicGrade {
  id           String   @id @default(cuid())
  enrollmentId String
  courseId     String
  courseName   String?
  score        Float
  maxScore     Float    @default(100)
  weight       Float    @default(1)
  gradedById   String
  gradedAt     DateTime @default(now())
  notes        String?
  createdAt    DateTime @default(now())

  enrollment AcademicEnrollment @relation(fields: [enrollmentId], references: [id])
  gradedBy   User               @relation("AcademicGrader", fields: [gradedById], references: [id])

  @@index([enrollmentId])
  @@index([courseId])
}

model AcademicTranscript {
  id                String   @id @default(cuid())
  userId            String   @unique
  gpa               Float    @default(0)
  totalHours        Int      @default(0)
  completedPrograms Int      @default(0)
  inProgressPrograms Int     @default(0)
  generatedAt       DateTime @default(now())
  updatedAt         DateTime @updatedAt

  user User @relation("AcademicTranscriptUser", fields: [userId], references: [id])
}

enum AcademicYearStatus { PLANNING ACTIVE CLOSED ARCHIVED }
enum PeriodType         { SEMESTER QUARTER MODULE ANNUAL }
enum ProgramLevel       { BASIC INTERMEDIATE ADVANCED EXPERT }
enum ClassModality      { ONLINE PRESENTIAL HYBRID }
enum ClassStatus        { SCHEDULED ONGOING COMPLETED CANCELLED }
enum AcademicEnrollmentStatus {
  PENDING APPROVED REJECTED IN_PROGRESS
  COMPLETED FAILED DROPPED SUSPENDED
}
```

```bash
npx prisma validate
npx prisma migrate dev --name "add_academic_management"
npx prisma generate
```

---

## PASSO 2 — DTOs

```typescript
// src/academic/dto/create-year.dto.ts
import { IsString, IsOptional, IsBoolean, IsDateString, IsEnum, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AcademicYearStatus } from '@prisma/client';

export class CreateYearDto {
  @ApiProperty({ example: '2025/2026' })
  @IsString() @Length(4, 20)
  name: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isCurrent?: boolean;

  @ApiPropertyOptional({ enum: AcademicYearStatus })
  @IsOptional() @IsEnum(AcademicYearStatus)
  status?: AcademicYearStatus;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;
}

// src/academic/dto/create-period.dto.ts
import { IsString, IsOptional, IsDateString, IsEnum, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PeriodType } from '@prisma/client';

export class CreatePeriodDto {
  @ApiProperty()
  @IsString()
  yearId: string;

  @ApiProperty({ example: '1º Semestre' })
  @IsString() @Length(2, 100)
  name: string;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  enrollmentStart?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  enrollmentEnd?: string;

  @ApiPropertyOptional({ enum: PeriodType, default: 'SEMESTER' })
  @IsOptional() @IsEnum(PeriodType)
  type?: PeriodType;
}

// src/academic/dto/create-program.dto.ts
import {
  IsString, IsOptional, IsEnum, IsInt, IsNumber, IsBoolean,
  IsArray, Min, Max, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProgramLevel } from '@prisma/client';

export class CreateProgramDto {
  @ApiProperty({ example: 'PROG-001' })
  @IsString() @Length(2, 50)
  code: string;

  @ApiProperty({ example: 'Liderança e Gestão de Equipas' })
  @IsString() @Length(2, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ProgramLevel, default: 'BASIC' })
  @IsOptional() @IsEnum(ProgramLevel)
  level?: ProgramLevel;

  @ApiProperty({ example: 40 })
  @IsInt() @Min(1)
  durationHours: number;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1)
  maxStudents?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1)
  minStudents?: number;

  @ApiPropertyOptional({ default: 60, minimum: 0, maximum: 100 })
  @IsOptional() @IsNumber() @Min(0) @Max(100)
  passingScore?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  certificateType?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  yearId?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  prerequisites?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  courseIds?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isMandatory?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  targetRoles?: string[];
}

// src/academic/dto/create-class.dto.ts
import {
  IsString, IsOptional, IsEnum, IsInt, IsDateString, Min, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClassModality } from '@prisma/client';

export class CreateClassDto {
  @ApiProperty()
  @IsString()
  programId: string;

  @ApiProperty({ example: 'Turma A — 2026' })
  @IsString() @Length(2, 100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  instructorId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1)
  maxStudents?: number;

  @ApiProperty()
  @IsDateString()
  startDate: string;

  @ApiProperty()
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ enum: ClassModality, default: 'ONLINE' })
  @IsOptional() @IsEnum(ClassModality)
  modality?: ClassModality;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  location?: string;

  @ApiPropertyOptional({ example: 'Seg/Qua 09:00-11:00' })
  @IsOptional() @IsString()
  schedule?: string;
}

// src/academic/dto/create-enrollment.dto.ts
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateEnrollmentDto {
  @ApiProperty()
  @IsString()
  userId: string;

  @ApiProperty()
  @IsString()
  programId: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  classId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  periodId?: string;
}

// src/academic/dto/grade-enrollment.dto.ts
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GradeEnrollmentDto {
  @ApiProperty()
  @IsString()
  enrollmentId: string;

  @ApiProperty()
  @IsString()
  courseId: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  courseName?: string;

  @ApiProperty({ minimum: 0 })
  @IsNumber() @Min(0)
  score: number;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional() @IsNumber() @Min(1)
  maxScore?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @IsNumber() @Min(0)
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}

// src/academic/dto/filter-program.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, IsBoolean, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ProgramLevel } from '@prisma/client';

export class FilterProgramDto {
  @ApiPropertyOptional() @IsOptional() @IsEnum(ProgramLevel)  level?: ProgramLevel;
  @ApiPropertyOptional() @IsOptional() @IsString()            category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()            search?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean() isMandatory?: boolean;
  @ApiPropertyOptional({ default: 1  }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?:  number = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 20;
}

// src/academic/dto/index.ts
export * from './create-year.dto';
export * from './create-period.dto';
export * from './create-program.dto';
export * from './create-class.dto';
export * from './create-enrollment.dto';
export * from './grade-enrollment.dto';
export * from './filter-program.dto';
```

---

## PASSO 3 — Service Completo

```typescript
// src/academic/academic.service.ts
import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateYearDto, CreatePeriodDto, CreateProgramDto, CreateClassDto,
  CreateEnrollmentDto, GradeEnrollmentDto, FilterProgramDto,
} from './dto';

@Injectable()
export class AcademicService {
  constructor(private prisma: PrismaService) {}

  // ─── ANOS LECTIVOS ───────────────────────────────────

  async createYear(dto: CreateYearDto, userId: string) {
    if (dto.isCurrent) {
      await this.prisma.academicYear.updateMany({
        where: { isCurrent: true, deletedAt: null },
        data: { isCurrent: false },
      });
    }
    const year = await this.prisma.academicYear.create({
      data: { ...dto, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'AcademicYear', year.id, { name: dto.name });
    return year;
  }

  async getCurrentYear() {
    return this.prisma.academicYear.findFirst({
      where: { isCurrent: true, deletedAt: null },
      include: { periods: { where: { deletedAt: null } } },
    });
  }

  async findAllYears() {
    return this.prisma.academicYear.findMany({
      where: { deletedAt: null },
      orderBy: { startDate: 'desc' },
      include: {
        _count: { select: { periods: true, programs: true } },
      },
    });
  }

  // ─── PERÍODOS ────────────────────────────────────────

  async createPeriod(dto: CreatePeriodDto, userId: string) {
    const year = await this.prisma.academicYear.findUnique({ where: { id: dto.yearId } });
    if (!year) throw new NotFoundException('Ano lectivo não encontrado');
    const period = await this.prisma.academicPeriod.create({ data: dto });
    await this.audit(userId, 'CREATE', 'AcademicPeriod', period.id, { name: dto.name });
    return period;
  }

  // ─── PROGRAMAS ───────────────────────────────────────

  async createProgram(dto: CreateProgramDto, userId: string) {
    const existing = await this.prisma.academicProgram.findUnique({
      where: { code: dto.code },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`Código ${dto.code} já existe`);
    }
    const program = await this.prisma.academicProgram.create({
      data: { ...dto, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'AcademicProgram', program.id, { code: dto.code });
    return program;
  }

  async findAllPrograms(filters: FilterProgramDto) {
    const { level, category, search, isMandatory, page = 1, limit = 20 } = filters;
    const where: any = {
      deletedAt: null, isActive: true,
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
    const [data, total] = await this.prisma.$transaction([
      this.prisma.academicProgram.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { fullName: true } },
          _count: { select: { enrollments: true, classes: true } },
        },
      }),
      this.prisma.academicProgram.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findProgramById(id: string) {
    const program = await this.prisma.academicProgram.findUnique({
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

  async createClass(dto: CreateClassDto, userId: string) {
    const program = await this.prisma.academicProgram.findUnique({
      where: { id: dto.programId },
    });
    if (!program) throw new NotFoundException('Programa não encontrado');
    const academicClass = await this.prisma.academicClass.create({ data: dto });
    await this.audit(userId, 'CREATE', 'AcademicClass', academicClass.id, { name: dto.name });
    return academicClass;
  }

  // ─── MATRÍCULAS ──────────────────────────────────────

  private async generateEnrollmentCode(): Promise<string> {
    const last = await this.prisma.academicEnrollment.findFirst({
      orderBy: { code: 'desc' }, select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('MAT-', '')) + 1 : 1;
    return `MAT-${String(num).padStart(5, '0')}`;
  }

  async enroll(dto: CreateEnrollmentDto, userId: string) {
    const program = await this.prisma.academicProgram.findUnique({
      where: { id: dto.programId },
    });
    if (!program) throw new NotFoundException('Programa não encontrado');

    // Verifica pré-requisitos
    if (program.prerequisites?.length) {
      const completed = await this.prisma.academicEnrollment.count({
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
        userId: dto.userId, programId: dto.programId,
        status: { notIn: ['DROPPED', 'FAILED', 'REJECTED'] },
        deletedAt: null,
      },
    });
    if (existing) throw new ConflictException('Já matriculado neste programa');

    // Verifica vagas na turma
    if (dto.classId) {
      const cls = await this.prisma.academicClass.findUnique({
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
    await this.audit(userId, 'CREATE', 'AcademicEnrollment', enrollment.id, { code });
    await this.prisma.notificationLog.create({
      data: {
        userId: dto.userId,
        title: 'Matrícula académica',
        message: `Matrícula em "${program.name}" ${enrollment.status === 'APPROVED' ? 'aprovada' : 'pendente'}.`,
        metadata: JSON.stringify({ enrollmentId: enrollment.id, programId: dto.programId }),
      },
    });
    return enrollment;
  }

  async approveEnrollment(id: string, approverId: string) {
    const enrollment = await this.prisma.academicEnrollment.findUnique({
      where: { id }, include: { program: true },
    });
    if (!enrollment) throw new NotFoundException('Matrícula não encontrada');
    if (enrollment.status !== 'PENDING') {
      throw new BadRequestException('Matrícula não está pendente');
    }
    const updated = await this.prisma.academicEnrollment.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: approverId, approvedAt: new Date() },
    });
    await this.audit(approverId, 'UPDATE', 'AcademicEnrollment', id, { status: 'APPROVED' });
    await this.prisma.notificationLog.create({
      data: {
        userId: enrollment.userId,
        title: 'Matrícula aprovada',
        message: `A tua matrícula em "${enrollment.program.name}" foi aprovada.`,
        metadata: JSON.stringify({ enrollmentId: id }),
      },
    });
    return updated;
  }

  async getMyEnrollments(userId: string, page = 1, limit = 20) {
    const where = { userId, deletedAt: null };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.academicEnrollment.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          program: { select: { name: true, code: true, level: true, durationHours: true } },
          class: { select: { name: true, modality: true } },
        },
      }),
      this.prisma.academicEnrollment.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ─── NOTAS ───────────────────────────────────────────

  async gradeEnrollment(dto: GradeEnrollmentDto, graderId: string) {
    const enrollment = await this.prisma.academicEnrollment.findUnique({
      where: { id: dto.enrollmentId }, include: { program: true },
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
    const allGrades = await this.prisma.academicGrade.findMany({
      where: { enrollmentId: dto.enrollmentId },
    });
    const totalWeight = allGrades.reduce((s, g) => s + g.weight, 0);
    const weightedScore = allGrades.reduce(
      (s, g) => s + (g.score / g.maxScore) * g.weight, 0,
    );
    const finalScore = totalWeight > 0
      ? Math.round((weightedScore / totalWeight) * 1000) / 10
      : 0;
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
    await this.audit(graderId, 'CREATE', 'AcademicGrade', grade.id, {
      enrollmentId: dto.enrollmentId, score: dto.score,
    });
    return grade;
  }

  async getEnrollmentGrades(enrollmentId: string) {
    return this.prisma.academicGrade.findMany({
      where: { enrollmentId },
      orderBy: { gradedAt: 'desc' },
      include: { gradedBy: { select: { fullName: true } } },
    });
  }

  // ─── TRANSCRIÇÃO ─────────────────────────────────────

  async getTranscript(userId: string) {
    const [transcript, enrollments] = await this.prisma.$transaction([
      this.prisma.academicTranscript.findUnique({ where: { userId } }),
      this.prisma.academicEnrollment.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        include: {
          program: { select: { name: true, code: true, durationHours: true, level: true } },
          grades: true,
        },
      }),
    ]);
    return { transcript, enrollments };
  }

  // ─── RELATÓRIO ───────────────────────────────────────

  async getAcademicReport() {
    const [
      totalPrograms, totalEnrollments, completed,
      inProgress, pending, avgScore, byLevel,
    ] = await this.prisma.$transaction([
      this.prisma.academicProgram.count({ where: { deletedAt: null, isActive: true } }),
      this.prisma.academicEnrollment.count({ where: { deletedAt: null } }),
      this.prisma.academicEnrollment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.academicEnrollment.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.academicEnrollment.count({ where: { status: 'PENDING' } }),
      this.prisma.academicEnrollment.aggregate({
        _avg: { finalScore: true },
        where: { finalScore: { not: null } },
      }),
      this.prisma.academicProgram.groupBy({
        by: ['level'], where: { deletedAt: null }, _count: { id: true },
      }),
    ]);
    return {
      totalPrograms, totalEnrollments,
      completed, inProgress, pending,
      completionRate: totalEnrollments > 0 ? (completed / totalEnrollments) * 100 : 0,
      averageScore: avgScore._avg.finalScore || 0,
      byLevel,
    };
  }

  // ─── HELPERS ─────────────────────────────────────────

  private async updateTranscript(userId: string) {
    const enrollments = await this.prisma.academicEnrollment.findMany({
      where: { userId, deletedAt: null },
      include: { program: { select: { durationHours: true } } },
    });
    const completed = enrollments.filter(e => e.status === 'COMPLETED');
    const inProgress = enrollments.filter(e => e.status === 'IN_PROGRESS');
    const totalHours = completed.reduce((s, e) => s + (e.program.durationHours || 0), 0);
    const scores = completed.filter(e => e.finalScore).map(e => e.finalScore!);
    const gpa = scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0;

    await this.prisma.academicTranscript.upsert({
      where: { userId },
      update: {
        gpa, totalHours,
        completedPrograms: completed.length,
        inProgressPrograms: inProgress.length,
      },
      create: {
        userId, gpa, totalHours,
        completedPrograms: completed.length,
        inProgressPrograms: inProgress.length,
      },
    });
  }

  private async audit(userId: string, action: string, entity: string, entityId: string, meta: any) {
    await this.prisma.auditLog.create({
      data: { userId, action, entity, entityId, metadata: JSON.stringify(meta) },
    });
  }
}
```

---

## PASSO 4 — Controller Completo

```typescript
// src/academic/academic.controller.ts
import {
  Controller, Get, Post, Put, Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { AcademicService } from './academic.service';
import {
  CreateYearDto, CreatePeriodDto, CreateProgramDto, CreateClassDto,
  CreateEnrollmentDto, GradeEnrollmentDto, FilterProgramDto,
} from './dto';

@ApiTags('Gestão Académica')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('academic')
export class AcademicController {
  constructor(private readonly service: AcademicService) {}

  // ─── ANOS ────────────────────────────────────────────

  @Post('years')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar ano lectivo' })
  createYear(@Body() dto: CreateYearDto, @CurrentUser() user: any) {
    return this.service.createYear(dto, user.id);
  }

  @Get('years')
  @ApiOperation({ summary: 'Listar anos lectivos' })
  findAllYears() {
    return this.service.findAllYears();
  }

  @Get('years/current')
  @ApiOperation({ summary: 'Ano lectivo actual' })
  getCurrentYear() {
    return this.service.getCurrentYear();
  }

  // ─── PERÍODOS ────────────────────────────────────────

  @Post('periods')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar período' })
  createPeriod(@Body() dto: CreatePeriodDto, @CurrentUser() user: any) {
    return this.service.createPeriod(dto, user.id);
  }

  // ─── PROGRAMAS ───────────────────────────────────────

  @Post('programs')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar programa académico' })
  createProgram(@Body() dto: CreateProgramDto, @CurrentUser() user: any) {
    return this.service.createProgram(dto, user.id);
  }

  @Get('programs')
  @ApiOperation({ summary: 'Listar programas (paginado)' })
  findAllPrograms(@Query() filters: FilterProgramDto) {
    return this.service.findAllPrograms(filters);
  }

  @Get('report')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Relatório académico' })
  getReport() {
    return this.service.getAcademicReport();
  }

  @Get('programs/:id')
  @ApiOperation({ summary: 'Detalhe de programa' })
  findProgramById(@Param('id') id: string) {
    return this.service.findProgramById(id);
  }

  // ─── TURMAS ──────────────────────────────────────────

  @Post('classes')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar turma' })
  createClass(@Body() dto: CreateClassDto, @CurrentUser() user: any) {
    return this.service.createClass(dto, user.id);
  }

  // ─── MATRÍCULAS ──────────────────────────────────────

  @Post('enrollments')
  @ApiOperation({ summary: 'Matricular aluno' })
  enroll(@Body() dto: CreateEnrollmentDto, @CurrentUser() user: any) {
    return this.service.enroll(dto, user.id);
  }

  @Put('enrollments/:id/approve')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Aprovar matrícula' })
  approveEnrollment(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.approveEnrollment(id, user.id);
  }

  @Get('my-enrollments')
  @ApiOperation({ summary: 'Minhas matrículas' })
  getMyEnrollments(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getMyEnrollments(user.id, page, limit);
  }

  // ─── NOTAS ───────────────────────────────────────────

  @Post('grades')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Lançar nota' })
  gradeEnrollment(@Body() dto: GradeEnrollmentDto, @CurrentUser() user: any) {
    return this.service.gradeEnrollment(dto, user.id);
  }

  @Get('enrollments/:id/grades')
  @ApiOperation({ summary: 'Notas da matrícula' })
  getEnrollmentGrades(@Param('id') id: string) {
    return this.service.getEnrollmentGrades(id);
  }

  // ─── TRANSCRIÇÃO ─────────────────────────────────────

  @Get('transcript')
  @ApiOperation({ summary: 'Minha transcrição académica' })
  getMyTranscript(@CurrentUser() user: any) {
    return this.service.getTranscript(user.id);
  }

  @Get('transcript/:userId')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Transcrição de um aluno' })
  getTranscript(@Param('userId') userId: string) {
    return this.service.getTranscript(userId);
  }
}
```

---

## PASSO 5 — Module

```typescript
// src/academic/academic.module.ts
import { Module }    from '@nestjs/common';
import { AcademicController } from './academic.controller';
import { AcademicService }    from './academic.service';
import { PrismaModule }       from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [AcademicController],
  providers:   [AcademicService],
  exports:     [AcademicService],
})
export class AcademicModule {}
```

```typescript
// src/app.module.ts — adicionar:
import { AcademicModule } from './academic/academic.module';
imports: [ ...existentes..., AcademicModule ],
```

---

## PASSO 6 — Spec File (10 testes)

```typescript
// src/academic/academic.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { AcademicService } from './academic.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';

const mockProgram = {
  id: 'prog-1', code: 'PROG-001', name: 'Liderança',
  level: 'BASIC', durationHours: 40, passingScore: 60,
  prerequisites: [], isMandatory: false, deletedAt: null,
};
const mockEnrollment = {
  id: 'enr-1', code: 'MAT-00001', userId: 'user-1',
  programId: 'prog-1', status: 'IN_PROGRESS',
  program: mockProgram,
};

const mockPrisma = {
  academicYear: {
    create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(),
    findMany: jest.fn(), updateMany: jest.fn(),
  },
  academicPeriod:  { create: jest.fn() },
  academicProgram: {
    create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(),
    findMany: jest.fn(), count: jest.fn(), groupBy: jest.fn(),
  },
  academicClass:   { create: jest.fn(), findUnique: jest.fn() },
  academicEnrollment: {
    create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(),
    findMany: jest.fn(), update: jest.fn(), count: jest.fn(),
  },
  academicGrade:      { create: jest.fn(), findMany: jest.fn() },
  academicTranscript: { findUnique: jest.fn(), upsert: jest.fn() },
  auditLog:        { create: jest.fn() },
  notificationLog: { create: jest.fn() },
  $transaction:    jest.fn(),
};

describe('AcademicService', () => {
  let service: AcademicService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcademicService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<AcademicService>(AcademicService);
    jest.clearAllMocks();
  });

  describe('createYear', () => {
    it('deve criar ano e desactivar outros se isCurrent', async () => {
      mockPrisma.academicYear.updateMany.mockResolvedValue({});
      mockPrisma.academicYear.create.mockResolvedValue({ id: 'y1', name: '2025/2026' });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createYear(
        { name: '2025/2026', startDate: '2025-09-01', endDate: '2026-07-31', isCurrent: true },
        'user-1',
      );
      expect(result.name).toBe('2025/2026');
      expect(mockPrisma.academicYear.updateMany).toHaveBeenCalled();
    });
  });

  describe('createProgram', () => {
    it('deve criar programa com código único', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue(null);
      mockPrisma.academicProgram.create.mockResolvedValue(mockProgram);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createProgram(
        { code: 'PROG-001', name: 'Liderança', durationHours: 40 },
        'user-1',
      );
      expect(result.code).toBe('PROG-001');
    });

    it('deve lançar ConflictException se código já existe', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue(mockProgram);
      await expect(
        service.createProgram({ code: 'PROG-001', name: 'X', durationHours: 10 }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('enroll', () => {
    it('deve matricular aluno com código MAT-', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue(mockProgram);
      mockPrisma.academicEnrollment.findFirst.mockResolvedValue(null);
      mockPrisma.academicEnrollment.create.mockResolvedValue(mockEnrollment);
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.enroll({ userId: 'user-1', programId: 'prog-1' }, 'admin-1');
      expect(result.code).toBe('MAT-00001');
    });

    it('deve lançar ConflictException se já matriculado', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue(mockProgram);
      mockPrisma.academicEnrollment.findFirst.mockResolvedValue(mockEnrollment);
      await expect(
        service.enroll({ userId: 'user-1', programId: 'prog-1' }, 'admin-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('deve lançar BadRequestException se pré-requisitos não cumpridos', async () => {
      mockPrisma.academicProgram.findUnique.mockResolvedValue({
        ...mockProgram, prerequisites: ['prog-0'],
      });
      mockPrisma.academicEnrollment.count.mockResolvedValue(0);
      await expect(
        service.enroll({ userId: 'user-1', programId: 'prog-1' }, 'admin-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('approveEnrollment', () => {
    it('deve aprovar matrícula pendente', async () => {
      mockPrisma.academicEnrollment.findUnique.mockResolvedValue({
        ...mockEnrollment, status: 'PENDING',
      });
      mockPrisma.academicEnrollment.update.mockResolvedValue({
        ...mockEnrollment, status: 'APPROVED',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.approveEnrollment('enr-1', 'admin-1');
      expect(result.status).toBe('APPROVED');
    });

    it('deve lançar BadRequestException se não está pendente', async () => {
      mockPrisma.academicEnrollment.findUnique.mockResolvedValue(mockEnrollment);
      await expect(service.approveEnrollment('enr-1', 'admin-1'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('gradeEnrollment', () => {
    it('deve lançar nota e marcar COMPLETED se passou', async () => {
      mockPrisma.academicEnrollment.findUnique.mockResolvedValue(mockEnrollment);
      mockPrisma.academicGrade.create.mockResolvedValue({ id: 'g1', score: 80 });
      mockPrisma.academicGrade.findMany.mockResolvedValue([
        { score: 80, maxScore: 100, weight: 1 },
      ]);
      mockPrisma.academicEnrollment.update.mockResolvedValue({});
      mockPrisma.academicEnrollment.findMany.mockResolvedValue([]);
      mockPrisma.academicTranscript.upsert.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.gradeEnrollment(
        { enrollmentId: 'enr-1', courseId: 'c1', score: 80 },
        'grader-1',
      );
      expect(result.score).toBe(80);
      expect(mockPrisma.academicTranscript.upsert).toHaveBeenCalled();
    });
  });

  describe('getReport', () => {
    it('deve retornar estatísticas académicas', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        10, 50, 30, 15, 5, { _avg: { finalScore: 72 } }, [],
      ]);
      const result = await service.getAcademicReport();
      expect(result.completionRate).toBe(60);
      expect(result.averageScore).toBe(72);
    });
  });
});
```

---

## PASSO 7 — Bruno CLI (8 ficheiros — fluxo completo)

```
# bruno/academic/01-criar-ano.bru
meta { name: Criar Ano Lectivo  type: http  seq: 1 }
post { url: {{baseUrl}}/academic/years  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "name": "2025/2026-BRUNO", "startDate": "2025-09-01", "endDate": "2026-07-31", "isCurrent": false }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("yearId", res.body.id); }
}

---

# bruno/academic/02-criar-periodo.bru
meta { name: Criar Período  type: http  seq: 2 }
post { url: {{baseUrl}}/academic/periods  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "yearId": "{{yearId}}", "name": "1º Semestre Bruno", "startDate": "2025-09-01", "endDate": "2026-01-31", "type": "SEMESTER" }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("periodId", res.body.id); }
}

---

# bruno/academic/03-criar-programa.bru
meta { name: Criar Programa  type: http  seq: 3 }
post { url: {{baseUrl}}/academic/programs  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "code": "PROG-BRUNO", "name": "Programa Bruno de Teste", "durationHours": 40, "passingScore": 60, "level": "BASIC" }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Código correcto", function() { expect(res.body.code).to.equal("PROG-BRUNO"); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("programId", res.body.id); }
}

---

# bruno/academic/04-listar-programas.bru
meta { name: Listar Programas  type: http  seq: 4 }
get { url: {{baseUrl}}/academic/programs?page=1&limit=20  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Paginação", function() { expect(res.body).to.have.property("totalPages"); });
}

---

# bruno/academic/05-matricular.bru
meta { name: Matricular Aluno  type: http  seq: 5 }
post { url: {{baseUrl}}/academic/enrollments  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "userId": "{{testUserId}}", "programId": "{{programId}}", "periodId": "{{periodId}}" }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Código MAT-", function() { expect(res.body.code).to.match(/^MAT-\d{5}$/); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("enrollmentId", res.body.id); }
}

---

# bruno/academic/06-aprovar-matricula.bru
meta { name: Aprovar Matrícula  type: http  seq: 6 }
put { url: {{baseUrl}}/academic/enrollments/{{enrollmentId}}/approve  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Aprovada", function() { expect(res.body.status).to.equal("APPROVED"); });
}

---

# bruno/academic/07-lancar-nota.bru
meta { name: Lançar Nota  type: http  seq: 7 }
post { url: {{baseUrl}}/academic/grades  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "enrollmentId": "{{enrollmentId}}", "courseId": "curso-1", "courseName": "Módulo 1", "score": 85, "maxScore": 100, "weight": 1 }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Nota correcta", function() { expect(res.body.score).to.equal(85); });
}

---

# bruno/academic/08-relatorio.bru
meta { name: Relatório Académico  type: http  seq: 8 }
get { url: {{baseUrl}}/academic/report  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem completionRate", function() { expect(res.body).to.have.property("completionRate"); });
}
```

---

## PASSO 8 — Frontend Completo

```tsx
// frontend/app/academic/programs/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';

const LEVEL_COLORS: Record<string, string> = {
  BASIC:        'bg-green-100 text-green-800',
  INTERMEDIATE: 'bg-blue-100 text-blue-800',
  ADVANCED:     'bg-purple-100 text-purple-800',
  EXPERT:       'bg-red-100 text-red-800',
};

export default function AcademicProgramsPage() {
  const [data, setData]             = useState<any[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        page: String(page), limit: '20',
        ...(search && { search }),
        ...(levelFilter && { level: levelFilter }),
      });
      const res = await fetch(`/api/academic/programs?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao carregar programas');
      const json = await res.json();
      setData(json.data); setTotal(json.total); setTotalPages(json.totalPages);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, search, levelFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-40 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
        {error}
        <button onClick={fetchData} className="ml-4 underline">Tentar novamente</button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programas Académicos</h1>
          <p className="text-gray-500">{total} programas disponíveis</p>
        </div>
        <a href="/academic/programs/novo"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + Novo Programa
        </a>
      </div>

      <div className="flex gap-4 flex-wrap">
        <input type="text" placeholder="Pesquisar por nome ou código..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2 flex-1 min-w-[200px]" />
        <select value={levelFilter}
          onChange={e => { setLevelFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2">
          <option value="">Todos os níveis</option>
          <option value="BASIC">Básico</option>
          <option value="INTERMEDIATE">Intermédio</option>
          <option value="ADVANCED">Avançado</option>
          <option value="EXPERT">Especialista</option>
        </select>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nenhum programa encontrado</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.map((p: any) => (
            <a key={p.id} href={`/academic/programs/${p.id}`}
              className="bg-white rounded-lg shadow hover:shadow-md transition p-5 flex flex-col">
              <div className="flex justify-between items-start mb-2">
                <span className="font-mono text-xs text-blue-600">{p.code}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[p.level]}`}>
                  {p.level}
                </span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{p.name}</h3>
              <p className="text-sm text-gray-500 line-clamp-2 mb-3">{p.description || 'Sem descrição'}</p>
              <div className="mt-auto flex justify-between text-xs text-gray-400 pt-3 border-t">
                <span>{p.durationHours}h</span>
                <span>{p._count?.enrollments || 0} alunos</span>
                <span>{p._count?.classes || 0} turmas</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex justify-between items-center">
          <span className="text-gray-500">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1} className="px-4 py-2 border rounded-lg disabled:opacity-50">
              Anterior
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages} className="px-4 py-2 border rounded-lg disabled:opacity-50">
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## PROMPT PARA O CLAUDE CODE

```
O Módulo 6 (Dashboard Institucional) está completo e aprovado.
Implementa agora o Módulo 7 — Sistema de Gestão Académica.
Lê o GESTAO-ACADEMICA-GUIDE.md na raiz do projecto.

ATENÇÃO: este é o módulo MAIS COMPLEXO — 6 modelos interligados.
A ordem das entidades importa:
Ano → Período → Programa → Turma → Matrícula → Nota → Transcrição

Segue EXACTAMENTE estes 22 passos:

1. Verifica se já existe algum AcademicProgram/Enrollment
   (pode existir versão antiga — usa estes modelos novos)

2. Adiciona ao prisma/schema.prisma:
   AcademicYear, AcademicPeriod, AcademicProgram,
   AcademicClass, AcademicEnrollment, AcademicGrade,
   AcademicTranscript + 6 enums

3. npx prisma validate
4. npx prisma migrate dev --name "add_academic_management"
5. npx prisma generate

6. Cria src/academic/dto/ com os 7 DTOs

7. Cria src/academic/academic.service.ts
   (gere ano→período→programa→turma→matrícula→nota→transcrição)

8. Cria src/academic/academic.controller.ts

9. Cria src/academic/academic.module.ts

10. Adiciona AcademicModule ao src/app.module.ts

11. npm run build → DEVE PASSAR com 0 erros

12. Cria o spec file (10 testes — módulo complexo)

13. npm run test -- --testPathPattern=academic --forceExit
    → DEVE PASSAR com 0 falhas

14. npm run test:cov 2>&1 | tail -5
    → Se < 55% adiciona mais testes

15. Cria bruno/academic/ com os 8 ficheiros .bru
    (fluxo completo: ano→período→programa→matrícula→nota)
    Precisa de testUserId no environment

16. Com o backend a correr:
    npx bru run bruno/academic/ --env local
    → TODOS devem passar (correr por ordem 01→08)

17. Cria frontend/app/academic/programs/page.tsx
    (grelha de programas com nível e filtros)

18. Cria frontend/app/academic/programs/[id]/page.tsx
    (detalhe com turmas e botão matricular)

19. Cria frontend/app/academic/transcript/page.tsx
    (minha transcrição com GPA e histórico)

20. Adiciona ao sidebar: link para /academic/programs

21. git add -A
    git commit -m "feat: Gestão Académica completa - 6 modelos, 10 specs, 8 bruno, frontend" --no-verify
    git push origin main

22. Mostra resumo:
    - Build: OK / FALHOU
    - Testes: X/10 passaram
    - Cobertura: X%
    - Bruno: X/8 passaram
    PARA e espera confirmação para Módulo 8

REGRAS ABSOLUTAS DO INNOVA:
- fullName (NUNCA name) — User model
- entity (NUNCA entityType) — AuditLog
- metadata → JSON.stringify()
- deletedAt em TODOS os novos modelos
- auditLog em CREATE, UPDATE, DELETE
- Paginação: { data, total, page, limit, totalPages }
- Angola: dd/MM/yyyy, AOA, UTC+1
- Backend porta 4000 | Frontend porta 3000

EXECUTA UMA OPERAÇÃO DE CADA VEZ.
A CADA 20 MINUTOS FAZ COMMIT PARCIAL.
SE FICAR LENTA (>25 min): commit e para.
```

---

*INNOVA — Gestão Académica Guide v1.0*
*Mesmo padrão dos Módulos 1-6 (o mais complexo)*
*SAP Education + Blackboard Enterprise + Banner (Ellucian)*
*6 modelos interligados + GPA + Transcrição + Pré-requisitos + Workflow de aprovação*
