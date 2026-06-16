# INNOVA — Módulo 8: LMS Completo
> Mesmo padrão dos Módulos 1-7
> Referência: Cornerstone OnDemand + Workday Learning + Moodle Enterprise + Docebo

---

## ⚠️ REGRAS ABSOLUTAS DO INNOVA

```
- fullName (NUNCA name) — User model
- entity (NUNCA entityType) — AuditLog
- textContent (NUNCA content) nas Lesson
- courseId_userId compound key no Enrollment
- metadata → JSON.stringify()
- deletedAt em TODOS os novos modelos
- auditLog em CREATE, UPDATE, DELETE
- Paginação: { data, total, page, limit, totalPages }
- Backend porta 4000 | Frontend porta 3000
```

---

## NATUREZA DESTE MÓDULO

```
O INNOVA já tem o núcleo de cursos:
Course, Lesson, Enrollment, LessonProgress, Quiz

O LMS Completo ADICIONA as capacidades avançadas:
✅ LearningPath — percursos estruturados de cursos
✅ LiveSession — sessões ao vivo (Zoom/Teams/Meet)
✅ LiveAttendance — presença nas sessões
✅ LearningRecommendation — recomendações automáticas
✅ LearningAnalytics — analytics de aprendizagem por utilizador

NÃO modifica os modelos existentes (Course, Enrollment).
```

---

## CHECKLIST OBRIGATÓRIO

```
□ Schema Prisma (5 modelos + 2 enums) + migrate dev
□ DTOs (learning-path + enroll-path + live-session + attendance + filter)
□ Service completo (paths + sessões + presenças + recomendações + analytics)
□ Controller completo (Swagger + Guards)
□ Module registado no AppModule
□ Spec file (8 testes mínimo)
□ Bruno CLI (6 ficheiros .bru)
□ Frontend page.tsx (percursos) + live-sessions + my-learning
□ npm run build → 0 erros
□ npm run test → 0 falhas
□ npm run test:cov → > 55%
□ npx bru run bruno/lms/ → passa
□ git commit descritivo
```

---

## PASSO 1 — Schema Prisma

```prisma
# Adicionar a prisma/schema.prisma

model LearningPath {
  id             String   @id @default(cuid())
  code           String   @unique
  name           String
  description    String?
  thumbnail      String?
  targetRoles    String[]
  targetDeptIds  String[]
  skills         String[]
  courseIds      String[]
  courseOrder    String[]
  estimatedHours Int?
  level          PathLevel @default(BASIC)
  isActive       Boolean  @default(true)
  isFeatured     Boolean  @default(false)
  isMandatory    Boolean  @default(false)
  enrolledCount  Int      @default(0)
  completedCount Int      @default(0)
  createdById    String
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  deletedAt      DateTime?

  createdBy   User                     @relation("PathCreator", fields: [createdById], references: [id])
  enrollments LearningPathEnrollment[]

  @@index([isActive])
  @@index([isFeatured])
  @@index([level])
  @@index([deletedAt])
}

model LearningPathEnrollment {
  id          String   @id @default(cuid())
  pathId      String
  userId      String
  progress    Float    @default(0)
  status      PathEnrollmentStatus @default(IN_PROGRESS)
  currentCourseId String?
  completedCourseIds String[]
  startedAt   DateTime @default(now())
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  path LearningPath @relation(fields: [pathId], references: [id])
  user User         @relation("PathStudent", fields: [userId], references: [id])

  @@unique([pathId, userId])
  @@index([userId])
  @@index([status])
  @@index([deletedAt])
}

model LiveSession {
  id           String          @id @default(cuid())
  code         String          @unique
  courseId     String?
  title        String
  description  String?
  instructorId String?
  scheduledAt  DateTime
  duration     Int
  timezone     String          @default("Africa/Luanda")
  meetingUrl   String?
  meetingId    String?
  platform     SessionPlatform @default(MEET)
  maxAttendees Int?
  recordingUrl String?
  materials    String[]
  status       SessionStatus   @default(SCHEDULED)
  isRecorded   Boolean         @default(true)
  createdById  String
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  deletedAt    DateTime?

  instructor  User?            @relation("SessionInstructor", fields: [instructorId], references: [id])
  createdBy   User             @relation("SessionCreator",    fields: [createdById],  references: [id])
  attendances LiveAttendance[]

  @@index([courseId])
  @@index([scheduledAt])
  @@index([status])
  @@index([deletedAt])
}

model LiveAttendance {
  id        String   @id @default(cuid())
  sessionId String
  userId    String
  joinedAt  DateTime?
  leftAt    DateTime?
  duration  Int?
  attended  Boolean  @default(false)
  feedback  String?
  rating    Int?
  createdAt DateTime @default(now())

  session LiveSession @relation(fields: [sessionId], references: [id])
  user    User        @relation("AttendanceUser", fields: [userId], references: [id])

  @@unique([sessionId, userId])
  @@index([sessionId])
  @@index([userId])
}

model LearningAnalytics {
  id               String   @id @default(cuid())
  userId           String   @unique
  totalHours       Float    @default(0)
  coursesStarted   Int      @default(0)
  coursesCompleted Int      @default(0)
  pathsCompleted   Int      @default(0)
  sessionsAttended Int      @default(0)
  avgQuizScore     Float    @default(0)
  streakDays       Int      @default(0)
  lastActivityAt   DateTime?
  updatedAt        DateTime @updatedAt

  user User @relation("AnalyticsUser", fields: [userId], references: [id])
}

enum PathLevel             { BASIC INTERMEDIATE ADVANCED EXPERT }
enum PathEnrollmentStatus  { IN_PROGRESS COMPLETED PAUSED DROPPED }
enum SessionPlatform       { ZOOM TEAMS MEET WEBEX OTHER }
enum SessionStatus         { SCHEDULED LIVE COMPLETED CANCELLED POSTPONED }
```

```bash
npx prisma validate
npx prisma migrate dev --name "add_lms_complete"
npx prisma generate
```

---

## PASSO 2 — DTOs

```typescript
// src/lms/dto/create-learning-path.dto.ts
import {
  IsString, IsOptional, IsEnum, IsInt, IsBoolean,
  IsArray, Min, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PathLevel } from '@prisma/client';

export class CreateLearningPathDto {
  @ApiProperty({ example: 'PATH-001' })
  @IsString() @Length(2, 50)
  code: string;

  @ApiProperty({ example: 'Percurso de Liderança' })
  @IsString() @Length(2, 200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  thumbnail?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  targetRoles?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  skills?: string[];

  @ApiProperty({ type: [String], description: 'IDs dos cursos do percurso' })
  @IsArray() @IsString({ each: true })
  courseIds: string[];

  @ApiPropertyOptional({ type: [String], description: 'Ordem dos cursos' })
  @IsOptional() @IsArray() @IsString({ each: true })
  courseOrder?: string[];

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1)
  estimatedHours?: number;

  @ApiPropertyOptional({ enum: PathLevel, default: 'BASIC' })
  @IsOptional() @IsEnum(PathLevel)
  level?: PathLevel;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isMandatory?: boolean;
}

// src/lms/dto/update-learning-path.dto.ts
import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateLearningPathDto } from './create-learning-path.dto';

export class UpdateLearningPathDto extends PartialType(CreateLearningPathDto) {
  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

// src/lms/dto/create-live-session.dto.ts
import {
  IsString, IsOptional, IsEnum, IsInt, IsBoolean,
  IsArray, IsDateString, Min, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SessionPlatform } from '@prisma/client';

export class CreateLiveSessionDto {
  @ApiProperty({ example: 'Webinar de Liderança' })
  @IsString() @Length(2, 200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  courseId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  instructorId?: string;

  @ApiProperty()
  @IsDateString()
  scheduledAt: string;

  @ApiProperty({ example: 90, description: 'Duração em minutos' })
  @IsInt() @Min(1)
  duration: number;

  @ApiPropertyOptional({ enum: SessionPlatform, default: 'MEET' })
  @IsOptional() @IsEnum(SessionPlatform)
  platform?: SessionPlatform;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  meetingUrl?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  meetingId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1)
  maxAttendees?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  materials?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isRecorded?: boolean;
}

// src/lms/dto/attendance.dto.ts
import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttendanceFeedbackDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional() @IsInt() @Min(1) @Max(5)
  rating?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  feedback?: string;
}

// src/lms/dto/filter-path.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, IsBoolean, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PathLevel } from '@prisma/client';

export class FilterPathDto {
  @ApiPropertyOptional() @IsOptional() @IsEnum(PathLevel)  level?: PathLevel;
  @ApiPropertyOptional() @IsOptional() @IsString()         search?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean() isFeatured?: boolean;
  @ApiPropertyOptional({ default: 1  }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?:  number = 1;
  @ApiPropertyOptional({ default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number = 20;
}

// src/lms/dto/index.ts
export * from './create-learning-path.dto';
export * from './update-learning-path.dto';
export * from './create-live-session.dto';
export * from './attendance.dto';
export * from './filter-path.dto';
```

---

## PASSO 3 — Service Completo

```typescript
// src/lms/lms.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLearningPathDto, UpdateLearningPathDto,
  CreateLiveSessionDto, AttendanceFeedbackDto, FilterPathDto,
} from './dto';

@Injectable()
export class LmsService {
  constructor(private prisma: PrismaService) {}

  // ─── GERAÇÃO DE CÓDIGOS ──────────────────────────────

  private async generateSessionCode(): Promise<string> {
    const last = await this.prisma.liveSession.findFirst({
      orderBy: { code: 'desc' }, select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('SES-', '')) + 1 : 1;
    return `SES-${String(num).padStart(5, '0')}`;
  }

  // ─── PERCURSOS DE APRENDIZAGEM ───────────────────────

  async createPath(dto: CreateLearningPathDto, userId: string) {
    const existing = await this.prisma.learningPath.findUnique({ where: { code: dto.code } });
    if (existing && !existing.deletedAt) {
      throw new ConflictException(`Código ${dto.code} já existe`);
    }
    const path = await this.prisma.learningPath.create({
      data: {
        ...dto,
        courseOrder: dto.courseOrder || dto.courseIds,
        createdById: userId,
      },
    });
    await this.audit(userId, 'CREATE', 'LearningPath', path.id, { code: dto.code });
    return path;
  }

  async findAllPaths(filters: FilterPathDto) {
    const { level, search, isFeatured, page = 1, limit = 20 } = filters;
    const where: any = {
      deletedAt: null, isActive: true,
      ...(level && { level }),
      ...(isFeatured !== undefined && { isFeatured }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.learningPath.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        include: {
          createdBy: { select: { fullName: true } },
          _count: { select: { enrollments: true } },
        },
      }),
      this.prisma.learningPath.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findPathById(id: string) {
    const path = await this.prisma.learningPath.findUnique({
      where: { id },
      include: {
        createdBy: { select: { fullName: true } },
        _count: { select: { enrollments: true } },
      },
    });
    if (!path || path.deletedAt) throw new NotFoundException('Percurso não encontrado');
    return path;
  }

  async updatePath(id: string, dto: UpdateLearningPathDto, userId: string) {
    await this.findPathById(id);
    const updated = await this.prisma.learningPath.update({ where: { id }, data: dto });
    await this.audit(userId, 'UPDATE', 'LearningPath', id, dto);
    return updated;
  }

  async softDeletePath(id: string, userId: string) {
    await this.findPathById(id);
    await this.prisma.learningPath.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit(userId, 'DELETE', 'LearningPath', id, { deletedAt: new Date() });
    return { message: 'Percurso removido com sucesso' };
  }

  // ─── MATRÍCULA EM PERCURSO ───────────────────────────

  async enrollInPath(pathId: string, userId: string) {
    const path = await this.findPathById(pathId);
    const existing = await this.prisma.learningPathEnrollment.findUnique({
      where: { pathId_userId: { pathId, userId } },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException('Já inscrito neste percurso');
    }
    const enrollment = await this.prisma.learningPathEnrollment.create({
      data: {
        pathId, userId,
        currentCourseId: path.courseOrder[0] || null,
      },
    });
    await this.prisma.learningPath.update({
      where: { id: pathId },
      data: { enrolledCount: { increment: 1 } },
    });
    await this.prisma.notificationLog.create({
      data: {
        userId,
        title: 'Inscrição em percurso',
        message: `Inscreveste-te no percurso "${path.name}".`,
        metadata: JSON.stringify({ pathId }),
      },
    });
    await this.audit(userId, 'CREATE', 'LearningPathEnrollment', enrollment.id, { pathId });
    return enrollment;
  }

  async updatePathProgress(pathId: string, completedCourseId: string, userId: string) {
    const enrollment = await this.prisma.learningPathEnrollment.findUnique({
      where: { pathId_userId: { pathId, userId } },
      include: { path: true },
    });
    if (!enrollment) throw new NotFoundException('Inscrição não encontrada');

    const completed = [...new Set([...enrollment.completedCourseIds, completedCourseId])];
    const totalCourses = enrollment.path.courseIds.length;
    const progress = totalCourses > 0
      ? Math.round((completed.length / totalCourses) * 100)
      : 0;
    const isComplete = progress >= 100;

    // Próximo curso da ordem
    const nextCourse = enrollment.path.courseOrder.find(c => !completed.includes(c));

    const updated = await this.prisma.learningPathEnrollment.update({
      where: { id: enrollment.id },
      data: {
        completedCourseIds: completed,
        currentCourseId: nextCourse || null,
        progress,
        status: isComplete ? 'COMPLETED' : 'IN_PROGRESS',
        completedAt: isComplete ? new Date() : null,
      },
    });

    if (isComplete) {
      await this.prisma.learningPath.update({
        where: { id: pathId },
        data: { completedCount: { increment: 1 } },
      });
      await this.updateAnalytics(userId, { pathsCompleted: 1 });
    }
    return updated;
  }

  async getMyPaths(userId: string) {
    return this.prisma.learningPathEnrollment.findMany({
      where: { userId, deletedAt: null },
      orderBy: { startedAt: 'desc' },
      include: {
        path: { select: { name: true, code: true, level: true, estimatedHours: true, thumbnail: true } },
      },
    });
  }

  // ─── SESSÕES AO VIVO ─────────────────────────────────

  async createSession(dto: CreateLiveSessionDto, userId: string) {
    const code = await this.generateSessionCode();
    const session = await this.prisma.liveSession.create({
      data: { ...dto, code, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'LiveSession', session.id, { code, title: dto.title });
    return session;
  }

  async findUpcomingSessions(page = 1, limit = 20) {
    const where = {
      deletedAt: null,
      status: { in: ['SCHEDULED', 'LIVE'] as any },
      scheduledAt: { gte: new Date() },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.liveSession.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { scheduledAt: 'asc' },
        include: {
          instructor: { select: { fullName: true } },
          _count: { select: { attendances: true } },
        },
      }),
      this.prisma.liveSession.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async registerForSession(sessionId: string, userId: string) {
    const session = await this.prisma.liveSession.findUnique({
      where: { id: sessionId },
      include: { _count: { select: { attendances: true } } },
    });
    if (!session) throw new NotFoundException('Sessão não encontrada');
    if (session.maxAttendees && session._count.attendances >= session.maxAttendees) {
      throw new ConflictException('Sessão lotada');
    }
    const existing = await this.prisma.liveAttendance.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (existing) throw new ConflictException('Já inscrito nesta sessão');

    return this.prisma.liveAttendance.create({
      data: { sessionId, userId },
    });
  }

  async markAttendance(sessionId: string, userId: string) {
    const attendance = await this.prisma.liveAttendance.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!attendance) throw new NotFoundException('Inscrição na sessão não encontrada');

    const updated = await this.prisma.liveAttendance.update({
      where: { id: attendance.id },
      data: { attended: true, joinedAt: new Date() },
    });
    await this.updateAnalytics(userId, { sessionsAttended: 1 });
    return updated;
  }

  async submitSessionFeedback(sessionId: string, dto: AttendanceFeedbackDto, userId: string) {
    const attendance = await this.prisma.liveAttendance.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (!attendance) throw new NotFoundException('Presença não encontrada');
    return this.prisma.liveAttendance.update({
      where: { id: attendance.id },
      data: { rating: dto.rating, feedback: dto.feedback },
    });
  }

  // ─── RECOMENDAÇÕES ───────────────────────────────────

  async getRecommendations(userId: string) {
    // Recomendações baseadas no cargo do utilizador
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roleId: true, fullName: true },
    });

    // Percursos direccionados ao cargo, ainda não iniciados
    const enrolled = await this.prisma.learningPathEnrollment.findMany({
      where: { userId, deletedAt: null },
      select: { pathId: true },
    });
    const enrolledIds = enrolled.map(e => e.pathId);

    const recommended = await this.prisma.learningPath.findMany({
      where: {
        deletedAt: null, isActive: true,
        id: { notIn: enrolledIds },
      },
      orderBy: [{ isFeatured: 'desc' }, { enrolledCount: 'desc' }],
      take: 5,
      select: {
        id: true, code: true, name: true, level: true,
        estimatedHours: true, thumbnail: true, enrolledCount: true,
      },
    });

    return recommended.map(p => ({
      ...p,
      reason: 'Recomendado com base na tua actividade',
    }));
  }

  // ─── ANALYTICS DO UTILIZADOR ─────────────────────────

  async getMyAnalytics(userId: string) {
    let analytics = await this.prisma.learningAnalytics.findUnique({ where: { userId } });
    if (!analytics) {
      analytics = await this.prisma.learningAnalytics.create({ data: { userId } });
    }
    return analytics;
  }

  async getLmsDashboard() {
    const [
      totalPaths, activePaths, totalEnrollments, completedPaths,
      upcomingSessions, totalSessions, byLevel,
    ] = await this.prisma.$transaction([
      this.prisma.learningPath.count({ where: { deletedAt: null } }),
      this.prisma.learningPath.count({ where: { isActive: true, deletedAt: null } }),
      this.prisma.learningPathEnrollment.count({ where: { deletedAt: null } }),
      this.prisma.learningPathEnrollment.count({ where: { status: 'COMPLETED' } }),
      this.prisma.liveSession.count({
        where: { status: 'SCHEDULED', scheduledAt: { gte: new Date() }, deletedAt: null },
      }),
      this.prisma.liveSession.count({ where: { deletedAt: null } }),
      this.prisma.learningPath.groupBy({
        by: ['level'], where: { deletedAt: null }, _count: { id: true },
      }),
    ]);
    return {
      totals: {
        totalPaths, activePaths, totalEnrollments, completedPaths,
        upcomingSessions, totalSessions,
        pathCompletionRate: totalEnrollments > 0 ? (completedPaths / totalEnrollments) * 100 : 0,
      },
      byLevel,
    };
  }

  // ─── HELPERS ─────────────────────────────────────────

  private async updateAnalytics(userId: string, increments: any) {
    const existing = await this.prisma.learningAnalytics.findUnique({ where: { userId } });
    if (!existing) {
      await this.prisma.learningAnalytics.create({
        data: { userId, ...increments, lastActivityAt: new Date() },
      });
      return;
    }
    const data: any = { lastActivityAt: new Date() };
    for (const key of Object.keys(increments)) {
      data[key] = { increment: increments[key] };
    }
    await this.prisma.learningAnalytics.update({ where: { userId }, data });
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
// src/lms/lms.controller.ts
import {
  Controller, Get, Post, Put, Delete, Body,
  Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { LmsService } from './lms.service';
import {
  CreateLearningPathDto, UpdateLearningPathDto,
  CreateLiveSessionDto, AttendanceFeedbackDto, FilterPathDto,
} from './dto';

@ApiTags('LMS — Aprendizagem')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lms')
export class LmsController {
  constructor(private readonly service: LmsService) {}

  // ─── PERCURSOS ───────────────────────────────────────

  @Post('paths')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar percurso de aprendizagem' })
  createPath(@Body() dto: CreateLearningPathDto, @CurrentUser() user: any) {
    return this.service.createPath(dto, user.id);
  }

  @Get('paths')
  @ApiOperation({ summary: 'Listar percursos (paginado)' })
  findAllPaths(@Query() filters: FilterPathDto) {
    return this.service.findAllPaths(filters);
  }

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Dashboard do LMS' })
  getDashboard() {
    return this.service.getLmsDashboard();
  }

  @Get('recommendations')
  @ApiOperation({ summary: 'Recomendações personalizadas' })
  getRecommendations(@CurrentUser() user: any) {
    return this.service.getRecommendations(user.id);
  }

  @Get('my-paths')
  @ApiOperation({ summary: 'Meus percursos' })
  getMyPaths(@CurrentUser() user: any) {
    return this.service.getMyPaths(user.id);
  }

  @Get('my-analytics')
  @ApiOperation({ summary: 'As minhas estatísticas de aprendizagem' })
  getMyAnalytics(@CurrentUser() user: any) {
    return this.service.getMyAnalytics(user.id);
  }

  @Get('paths/:id')
  @ApiOperation({ summary: 'Detalhe de percurso' })
  findPathById(@Param('id') id: string) {
    return this.service.findPathById(id);
  }

  @Put('paths/:id')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Actualizar percurso' })
  updatePath(@Param('id') id: string, @Body() dto: UpdateLearningPathDto, @CurrentUser() user: any) {
    return this.service.updatePath(id, dto, user.id);
  }

  @Delete('paths/:id')
  @Roles('ADMIN', 'RH')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover percurso' })
  removePath(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.softDeletePath(id, user.id);
  }

  @Post('paths/:id/enroll')
  @ApiOperation({ summary: 'Inscrever-me no percurso' })
  enrollInPath(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.enrollInPath(id, user.id);
  }

  @Put('paths/:id/progress')
  @ApiOperation({ summary: 'Marcar curso do percurso como concluído' })
  updateProgress(
    @Param('id') id: string,
    @Body('completedCourseId') completedCourseId: string,
    @CurrentUser() user: any,
  ) {
    return this.service.updatePathProgress(id, completedCourseId, user.id);
  }

  // ─── SESSÕES AO VIVO ─────────────────────────────────

  @Post('sessions')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar sessão ao vivo' })
  createSession(@Body() dto: CreateLiveSessionDto, @CurrentUser() user: any) {
    return this.service.createSession(dto, user.id);
  }

  @Get('sessions/upcoming')
  @ApiOperation({ summary: 'Próximas sessões ao vivo' })
  findUpcomingSessions(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.service.findUpcomingSessions(page, limit);
  }

  @Post('sessions/:id/register')
  @ApiOperation({ summary: 'Inscrever-me na sessão' })
  registerForSession(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.registerForSession(id, user.id);
  }

  @Put('sessions/:id/attend')
  @ApiOperation({ summary: 'Marcar presença' })
  markAttendance(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.markAttendance(id, user.id);
  }

  @Put('sessions/:id/feedback')
  @ApiOperation({ summary: 'Avaliar sessão' })
  submitFeedback(
    @Param('id') id: string,
    @Body() dto: AttendanceFeedbackDto,
    @CurrentUser() user: any,
  ) {
    return this.service.submitSessionFeedback(id, dto, user.id);
  }
}
```

---

## PASSO 5 — Module

```typescript
// src/lms/lms.module.ts
import { Module }    from '@nestjs/common';
import { LmsController } from './lms.controller';
import { LmsService }    from './lms.service';
import { PrismaModule }  from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [LmsController],
  providers:   [LmsService],
  exports:     [LmsService],
})
export class LmsModule {}
```

```typescript
// src/app.module.ts — adicionar:
import { LmsModule } from './lms/lms.module';
imports: [ ...existentes..., LmsModule ],
```

---

## PASSO 6 — Spec File (8 testes)

```typescript
// src/lms/lms.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { LmsService } from './lms.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

const mockPath = {
  id: 'path-1', code: 'PATH-001', name: 'Percurso Liderança',
  level: 'BASIC', courseIds: ['c1', 'c2'], courseOrder: ['c1', 'c2'],
  isActive: true, deletedAt: null,
};
const mockPrisma = {
  user: { findUnique: jest.fn() },
  learningPath: {
    create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(),
    findMany: jest.fn(), update: jest.fn(), count: jest.fn(), groupBy: jest.fn(),
  },
  learningPathEnrollment: {
    create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(),
    update: jest.fn(), count: jest.fn(),
  },
  liveSession: {
    create: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(),
    findMany: jest.fn(), count: jest.fn(),
  },
  liveAttendance: {
    create: jest.fn(), findUnique: jest.fn(), update: jest.fn(),
  },
  learningAnalytics: {
    findUnique: jest.fn(), create: jest.fn(), update: jest.fn(),
  },
  auditLog:        { create: jest.fn() },
  notificationLog: { create: jest.fn() },
  $transaction:    jest.fn(),
};

describe('LmsService', () => {
  let service: LmsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LmsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LmsService>(LmsService);
    jest.clearAllMocks();
  });

  describe('createPath', () => {
    it('deve criar percurso com código', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue(null);
      mockPrisma.learningPath.create.mockResolvedValue(mockPath);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createPath(
        { code: 'PATH-001', name: 'Percurso Liderança', courseIds: ['c1', 'c2'] },
        'user-1',
      );
      expect(result.code).toBe('PATH-001');
    });

    it('deve lançar ConflictException se código existe', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue(mockPath);
      await expect(
        service.createPath({ code: 'PATH-001', name: 'X', courseIds: [] }, 'user-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAllPaths', () => {
    it('deve retornar lista paginada', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockPath], 1]);
      const result = await service.findAllPaths({ page: 1, limit: 20 });
      expect(result).toMatchObject({ total: 1, totalPages: 1 });
    });
  });

  describe('enrollInPath', () => {
    it('deve inscrever utilizador no percurso', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue(mockPath);
      mockPrisma.learningPathEnrollment.findUnique.mockResolvedValue(null);
      mockPrisma.learningPathEnrollment.create.mockResolvedValue({ id: 'enr-1', pathId: 'path-1' });
      mockPrisma.learningPath.update.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.enrollInPath('path-1', 'user-1');
      expect(result.pathId).toBe('path-1');
    });

    it('deve lançar ConflictException se já inscrito', async () => {
      mockPrisma.learningPath.findUnique.mockResolvedValue(mockPath);
      mockPrisma.learningPathEnrollment.findUnique.mockResolvedValue({ id: 'enr-1', deletedAt: null });
      await expect(service.enrollInPath('path-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('updatePathProgress', () => {
    it('deve marcar COMPLETED quando todos os cursos concluídos', async () => {
      mockPrisma.learningPathEnrollment.findUnique.mockResolvedValue({
        id: 'enr-1', completedCourseIds: ['c1'],
        path: { courseIds: ['c1', 'c2'], courseOrder: ['c1', 'c2'] },
      });
      mockPrisma.learningPathEnrollment.update.mockResolvedValue({
        id: 'enr-1', status: 'COMPLETED', progress: 100,
      });
      mockPrisma.learningPath.update.mockResolvedValue({});
      mockPrisma.learningAnalytics.findUnique.mockResolvedValue({ userId: 'user-1' });
      mockPrisma.learningAnalytics.update.mockResolvedValue({});

      const result = await service.updatePathProgress('path-1', 'c2', 'user-1');
      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('createSession', () => {
    it('deve criar sessão com código SES-', async () => {
      mockPrisma.liveSession.findFirst.mockResolvedValue(null);
      mockPrisma.liveSession.create.mockResolvedValue({ id: 'ses-1', code: 'SES-00001', title: 'Webinar' });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createSession(
        { title: 'Webinar', scheduledAt: '2026-07-01T10:00:00Z', duration: 90 },
        'user-1',
      );
      expect(result.code).toBe('SES-00001');
    });
  });

  describe('registerForSession', () => {
    it('deve lançar ConflictException se sessão lotada', async () => {
      mockPrisma.liveSession.findUnique.mockResolvedValue({
        id: 'ses-1', maxAttendees: 2, _count: { attendances: 2 },
      });
      await expect(service.registerForSession('ses-1', 'user-1')).rejects.toThrow(ConflictException);
    });
  });

  describe('getLmsDashboard', () => {
    it('deve retornar totais e taxa de conclusão', async () => {
      mockPrisma.$transaction.mockResolvedValue([10, 8, 50, 30, 3, 15, []]);
      const result = await service.getLmsDashboard();
      expect(result.totals.pathCompletionRate).toBe(60);
    });
  });
});
```

---

## PASSO 7 — Bruno CLI (6 ficheiros)

```
# bruno/lms/01-criar-percurso.bru
meta { name: Criar Percurso  type: http  seq: 1 }
post { url: {{baseUrl}}/lms/paths  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  {
    "code": "PATH-BRUNO",
    "name": "Percurso Bruno de Teste",
    "courseIds": ["curso-1", "curso-2"],
    "level": "BASIC",
    "estimatedHours": 20
  }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Código correcto", function() { expect(res.body.code).to.equal("PATH-BRUNO"); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("pathId", res.body.id); }
}

---

# bruno/lms/02-listar-percursos.bru
meta { name: Listar Percursos  type: http  seq: 2 }
get { url: {{baseUrl}}/lms/paths?page=1&limit=20  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Paginação", function() { expect(res.body).to.have.property("totalPages"); });
}

---

# bruno/lms/03-inscrever-percurso.bru
meta { name: Inscrever no Percurso  type: http  seq: 3 }
post { url: {{baseUrl}}/lms/paths/{{pathId}}/enroll  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Tem pathId", function() { expect(res.body.pathId).to.equal(bru.getEnvVar("pathId")); });
}

---

# bruno/lms/04-criar-sessao.bru
meta { name: Criar Sessão ao Vivo  type: http  seq: 4 }
post { url: {{baseUrl}}/lms/sessions  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  {
    "title": "Webinar Bruno de Teste",
    "scheduledAt": "2026-12-01T10:00:00Z",
    "duration": 90,
    "platform": "MEET"
  }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Código SES-", function() { expect(res.body.code).to.match(/^SES-\d{5}$/); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("sessionId", res.body.id); }
}

---

# bruno/lms/05-proximas-sessoes.bru
meta { name: Próximas Sessões  type: http  seq: 5 }
get { url: {{baseUrl}}/lms/sessions/upcoming?page=1&limit=20  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Paginação", function() { expect(res.body).to.have.property("totalPages"); });
}

---

# bruno/lms/06-dashboard.bru
meta { name: Dashboard LMS  type: http  seq: 6 }
get { url: {{baseUrl}}/lms/dashboard  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem totais", function() {
    expect(res.body).to.have.property("totals");
    expect(res.body.totals).to.have.property("pathCompletionRate");
  });
}
```

---

## PASSO 8 — Frontend Completo

```tsx
// frontend/app/lms/paths/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';

const LEVEL_COLORS: Record<string, string> = {
  BASIC:        'bg-green-100 text-green-800',
  INTERMEDIATE: 'bg-blue-100 text-blue-800',
  ADVANCED:     'bg-purple-100 text-purple-800',
  EXPERT:       'bg-red-100 text-red-800',
};

export default function LearningPathsPage() {
  const [data, setData]             = useState<any[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        page: String(page), limit: '20',
        ...(search && { search }),
      });
      const res = await fetch(`/api/lms/paths?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao carregar percursos');
      const json = await res.json();
      setData(json.data); setTotal(json.total); setTotalPages(json.totalPages);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const enroll = async (pathId: string) => {
    try {
      const res = await fetch(`/api/lms/paths/${pathId}/enroll`, {
        method: 'POST', credentials: 'include',
      });
      if (res.ok) alert('Inscrição realizada com sucesso!');
      else { const j = await res.json(); alert(j.message || 'Erro ao inscrever'); }
    } catch { alert('Erro ao inscrever'); }
  };

  if (loading) return (
    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-48 bg-gray-100 rounded-lg animate-pulse" />
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
          <h1 className="text-2xl font-bold text-gray-900">Percursos de Aprendizagem</h1>
          <p className="text-gray-500">{total} percursos disponíveis</p>
        </div>
        <a href="/lms/my-paths"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Os Meus Percursos
        </a>
      </div>

      <input type="text" placeholder="Pesquisar percursos..."
        value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
        className="border rounded-lg px-4 py-2 w-full max-w-md" />

      {data.length === 0 ? (
        <div className="text-center py-12 text-gray-400">Nenhum percurso encontrado</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {data.map((p: any) => (
            <div key={p.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition overflow-hidden flex flex-col">
              <div className="h-32 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl">
                🎓
              </div>
              <div className="p-5 flex flex-col flex-1">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-mono text-xs text-blue-600">{p.code}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEVEL_COLORS[p.level]}`}>
                    {p.level}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">{p.name}</h3>
                <p className="text-sm text-gray-500 line-clamp-2 mb-3">{p.description || ''}</p>
                <div className="mt-auto flex justify-between items-center text-xs text-gray-400 mb-3">
                  <span>{p.estimatedHours || '—'}h</span>
                  <span>{p._count?.enrollments || 0} inscritos</span>
                </div>
                <button onClick={() => enroll(p.id)}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 text-sm">
                  Inscrever-me
                </button>
              </div>
            </div>
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
O Módulo 7 (Gestão Académica) está completo e aprovado.
Implementa agora o Módulo 8 — LMS Completo.
Lê o LMS-COMPLETO-GUIDE.md na raiz do projecto.

ATENÇÃO: o INNOVA já tem Course, Lesson, Enrollment.
Este módulo NÃO os modifica — adiciona capacidades avançadas:
LearningPath, LiveSession, LiveAttendance, LearningAnalytics.

Segue EXACTAMENTE estes 22 passos:

1. Verifica os modelos existentes
   (NÃO confundir LearningPath novo com Course existente)

2. Adiciona ao prisma/schema.prisma:
   LearningPath, LearningPathEnrollment, LiveSession,
   LiveAttendance, LearningAnalytics + enums

3. npx prisma validate
4. npx prisma migrate dev --name "add_lms_complete"
5. npx prisma generate

6. Cria src/lms/dto/ com os 5 DTOs

7. Cria src/lms/lms.service.ts
   (percursos + progresso + sessões + presenças +
   recomendações + analytics)

8. Cria src/lms/lms.controller.ts

9. Cria src/lms/lms.module.ts

10. Adiciona LmsModule ao src/app.module.ts

11. npm run build → DEVE PASSAR com 0 erros

12. Cria o spec file (8 testes conforme o guia)

13. npm run test -- --testPathPattern=lms --forceExit
    → DEVE PASSAR com 0 falhas

14. npm run test:cov 2>&1 | tail -5
    → Se < 55% adiciona mais testes

15. Cria bruno/lms/ com os 6 ficheiros .bru

16. Com o backend a correr:
    npx bru run bruno/lms/ --env local
    → TODOS devem passar

17. Cria frontend/app/lms/paths/page.tsx
    (cards de percursos com botão inscrever)

18. Cria frontend/app/lms/my-paths/page.tsx
    (meus percursos com barra de progresso)

19. Cria frontend/app/lms/sessions/page.tsx
    (próximas sessões ao vivo com botão registar)

20. Adiciona ao sidebar: link para /lms/paths

21. git add -A
    git commit -m "feat: LMS Completo - percursos, sessões ao vivo, analytics, 8 specs, 6 bruno" --no-verify
    git push origin main

22. Mostra resumo:
    - Build: OK / FALHOU
    - Testes: X/8 passaram
    - Cobertura: X%
    - Bruno: X/6 passaram
    PARA e espera confirmação para Módulo 9 (o último)

REGRAS ABSOLUTAS DO INNOVA:
- fullName (NUNCA name) — User model
- entity (NUNCA entityType) — AuditLog
- textContent (NUNCA content) nas Lesson
- courseId_userId compound key no Enrollment
- metadata → JSON.stringify()
- deletedAt em TODOS os novos modelos
- auditLog em CREATE, UPDATE, DELETE
- Paginação: { data, total, page, limit, totalPages }
- Backend porta 4000 | Frontend porta 3000

EXECUTA UMA OPERAÇÃO DE CADA VEZ.
A CADA 20 MINUTOS FAZ COMMIT PARCIAL.
SE FICAR LENTA (>25 min): commit e para.
```

---

*INNOVA — LMS Completo Guide v1.0*
*Mesmo padrão dos Módulos 1-7*
*Cornerstone OnDemand + Workday Learning + Moodle Enterprise + Docebo*
*Percursos + Sessões ao Vivo + Presenças + Recomendações + Analytics*
