import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { AcademicService } from './academic.service';
import {
  CreateYearDto,
  CreatePeriodDto,
  CreateProgramDto,
  CreateClassDto,
  CreateEnrollmentDto,
  GradeEnrollmentDto,
  FilterProgramDto,
} from './dto';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Gestão Académica')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('academic')
export class AcademicController {
  constructor(private readonly service: AcademicService) {}

  // ─── ANOS ────────────────────────────────────────────

  @Post('years')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar ano lectivo' })
  createYear(@Body() dto: CreateYearDto, @CurrentUser() user: CurrentUserData) {
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
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar período' })
  createPeriod(@Body() dto: CreatePeriodDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createPeriod(dto, user.id);
  }

  // ─── PROGRAMAS ───────────────────────────────────────

  @Post('programs')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar programa académico' })
  createProgram(@Body() dto: CreateProgramDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createProgram(dto, user.id);
  }

  @Get('programs')
  @ApiOperation({ summary: 'Listar programas (paginado)' })
  findAllPrograms(@Query() filters: FilterProgramDto) {
    return this.service.findAllPrograms(filters);
  }

  @Get('report')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
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
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar turma' })
  createClass(@Body() dto: CreateClassDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createClass(dto, user.id);
  }

  // ─── MATRÍCULAS ──────────────────────────────────────

  @Post('enrollments')
  @ApiOperation({ summary: 'Matricular aluno' })
  enroll(@Body() dto: CreateEnrollmentDto, @CurrentUser() user: CurrentUserData) {
    return this.service.enroll(dto, user.id);
  }

  @Put('enrollments/:id/approve')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Aprovar matrícula' })
  approveEnrollment(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.service.approveEnrollment(id, user.id);
  }

  @Get('my-enrollments')
  @ApiOperation({ summary: 'Minhas matrículas' })
  getMyEnrollments(
    @CurrentUser() user: CurrentUserData,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.service.getMyEnrollments(user.id, page, limit);
  }

  // ─── NOTAS ───────────────────────────────────────────

  @Post('grades')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Lançar nota' })
  gradeEnrollment(@Body() dto: GradeEnrollmentDto, @CurrentUser() user: CurrentUserData) {
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
  getMyTranscript(@CurrentUser() user: CurrentUserData) {
    return this.service.getTranscript(user.id);
  }

  @Get('transcript/:userId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Transcrição de um aluno' })
  getTranscript(@Param('userId', ParseIntPipe) userId: number) {
    return this.service.getTranscript(userId);
  }
}
