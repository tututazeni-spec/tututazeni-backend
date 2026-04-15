import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EnrollmentsService } from './enrollments.service';
import {
  CreateEnrollmentDto, UpdateEnrollmentStatusDto,
  EnrollmentFilterDto, BulkEnrollDto,
  CancelEnrollmentDto, UpdateDeadlineDto,
} from './enrollments.dto';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Enrollments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly svc: EnrollmentsService) {}

  // ── Colaborador ───────────────────────────────────────────────────────────

  @Get('my')
  @ApiOperation({ summary: 'As minhas matrículas (agrupadas por estado)' })
  myEnrollments(@CurrentUser() user: any, @Query() filters: EnrollmentFilterDto) {
    return this.svc.getUserEnrollments(user.id, filters);
  }

  @Post('self-enroll/:courseId')
  @ApiOperation({ summary: 'Auto-matrícula num curso' })
  selfEnroll(
    @Param('courseId', ParseIntPipe) courseId: number,
    @CurrentUser() user: any,
  ) {
    return this.svc.enroll({
      userId:   user.id,
      courseId,
      origin: 'MANUAL' as any
    });
  }

  @Patch('my/:id/cancel')
  @ApiOperation({ summary: 'Cancelar a minha matrícula (apenas opcionais)' })
  @HttpCode(HttpStatus.OK)
  cancelMy(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: CancelEnrollmentDto,
  ) {
    return this.svc.cancel(id, dto, user.id);
  }

  @Post('my/:id/certificate')
  @ApiOperation({ summary: 'Gerar/obter certificado da matrícula concluída' })
  @HttpCode(HttpStatus.OK)
  myCertificate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.generateCertificate(id);
  }

  // ── Admin / RH ────────────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Listar matrículas com filtros avançados (inclui compliance)' })
  findAll(@Query() filters: EnrollmentFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('admin/dashboard')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Dashboard administrativo de matrículas' })
  adminDashboard() {
    return this.svc.getAdminDashboard();
  }

  @Get('compliance')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Dashboard de compliance (obrigatórios, atrasos)' })
  @ApiQuery({ name: 'departmentId', required: false })
  compliance(@Query('departmentId') departmentId?: string) {
    return this.svc.getComplianceDashboard(departmentId ? parseInt(departmentId) : undefined);
  }

  @Get('team')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Progresso da equipa (para gestores)' })
  @ApiQuery({ name: 'courseId', required: false })
  teamProgress(
    @CurrentUser() user: any,
    @Query('courseId') courseId?: string,
  ) {
    return this.svc.getTeamProgress(user.id, courseId ? parseInt(courseId) : undefined);
  }

  @Get('users/:userId')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Matrículas de um utilizador específico' })
  userEnrollments(
    @Param('userId', ParseIntPipe) userId: number,
    @Query() filters: EnrollmentFilterDto,
  ) {
    return this.svc.getUserEnrollments(userId, filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da matrícula com progresso' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Matricular utilizador num curso' })
  enroll(@CurrentUser() admin: any, @Body() dto: CreateEnrollmentDto) {
    return this.svc.enroll({ ...dto, assignedById: admin.id });
  }

  @Post('bulk')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Matrículas em massa (com relatório de erros detalhado)' })
  bulkEnroll(@Body() dto: BulkEnrollDto) {
    return this.svc.bulkEnroll(dto);
  }

  @Put(':id/status')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar status da matrícula' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEnrollmentStatusDto,
  ) {
    return this.svc.updateStatus(id, dto);
  }

  @Patch(':id/deadline')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar deadline da matrícula' })
  @HttpCode(HttpStatus.OK)
  updateDeadline(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDeadlineDto) {
    return this.svc.updateDeadline(id, dto);
  }

  @Patch(':id/cancel')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Cancelar matrícula (Admin pode cancelar qualquer)' })
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() admin: any,
    @Body() dto: CancelEnrollmentDto,
  ) {
    // Admin ignora a verificação de mandatory
    return this.prisma.enrollment.update({
      where: { id },
      data:  { status: 'CANCELLED', cancelReason: dto.reason, cancelledAt: new Date() },
    });
  }

  @Post(':id/certificate')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Gerar certificado para matrícula concluída (Admin)' })
  @HttpCode(HttpStatus.OK)
  certificate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.generateCertificate(id);
  }

  @Post('sync-overdue')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Sincronizar status OVERDUE (executar periodicamente)' })
  @HttpCode(HttpStatus.OK)
  syncOverdue() {
    return this.svc.syncOverdueStatus();
  }

  // ─── Fix: usar o prisma da service para o admin cancel ─────────────────
  private get prisma() {
    return (this.svc as any).prisma as any;
  }
}
