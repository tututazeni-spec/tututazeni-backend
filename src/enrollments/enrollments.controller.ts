import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EnrollmentsService } from './enrollments.service';
import {
  CreateEnrollmentDto, UpdateEnrollmentStatusDto,
  EnrollmentFilterDto, BulkEnrollDto,
} from './enrollments.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Enrollments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly svc: EnrollmentsService) {}
 
  @Get()
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Listar matrículas' })
  findAll(@Query() filters: EnrollmentFilterDto) { return this.svc.findAll(filters); }
 
  @Get('my')
  @ApiOperation({ summary: 'Minhas matrículas' })
  myEnrollments(@CurrentUser() user: any) { return this.svc.getUserEnrollments(user.id); }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da matrícula com progresso' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Matricular utilizador num curso' })
  enroll(@Body() dto: CreateEnrollmentDto) { return this.svc.enroll(dto); }
 
  @Post('self-enroll/:courseId')
  @ApiOperation({ summary: 'Auto-matrícula em curso' })
  selfEnroll(@Param('courseId', ParseIntPipe) courseId: number, @CurrentUser() user: any) {
    return this.svc.enroll({ userId: user.id, courseId });
  }
 
  @Post('bulk')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Matrículas em massa' })
  bulkEnroll(@Body() dto: BulkEnrollDto) { return this.svc.bulkEnroll(dto); }
 
  @Put(':id/status')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar status da matrícula' })
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEnrollmentStatusDto,
  ) { return this.svc.updateStatus(id, dto); }
 
  @Patch(':id/cancel')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Cancelar matrícula' })
  cancel(@Param('id', ParseIntPipe) id: number) { return this.svc.cancel(id); }
 
  @Post(':id/certificate')
  @ApiOperation({ summary: 'Gerar certificado para matrícula concluída' })
  certificate(@Param('id', ParseIntPipe) id: number) { return this.svc.generateCertificate(id); }
}
 
