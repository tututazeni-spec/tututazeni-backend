// ─── src/leave-management/leave-absences.controller.ts ───────────────────────
// Gestão de Ausências (docs/Modulo_Leave.md §5). Declarado ANTES de
// LeaveManagementController no módulo: `GET /leave/absences` colidiria com
// `GET /leave/:id` se este fosse registado primeiro (ver memória "route
// shadowing").
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { LeaveAbsencesService } from './leave-absences.service';
import {
  AbsenceFilterDto,
  AddAbsenceAttachmentDto,
  CorrectAbsenceDto,
  CreateAbsenceDto,
  ForwardAbsenceDto,
  SubmitJustificationDto,
  SyncAttendanceDto,
  ValidateAbsenceDto,
} from './leave-management.dto';

const REVIEWER_ROLES = [Role.ADMIN, Role.RH, Role.GESTOR, Role.DIRECTOR, Role.LIDER];

@ApiTags('Leave Management — Ausências')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave/absences')
export class LeaveAbsencesController {
  constructor(private readonly svc: LeaveAbsencesService) {}

  @Get()
  @ApiOperation({ summary: 'Ocorrências de ausência do âmbito do perfil' })
  list(@Query() filters: AbsenceFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.list(filters, user);
  }

  @Get('export')
  @Roles(...REVIEWER_ROLES)
  @ApiOperation({ summary: 'Exportar ocorrências (CSV) do âmbito do perfil' })
  export(@Query() filters: AbsenceFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.exportCsv(filters, user);
  }

  @Get('history/:userId')
  @ApiOperation({ summary: 'Histórico de ausências de um colaborador' })
  history(@Param('userId', ParseIntPipe) userId: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.history(userId, user);
  }

  @Post()
  @ApiOperation({ summary: 'Registar ausência (associa o registo de assiduidade existente)' })
  create(@Body() dto: CreateAbsenceDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.create(dto, user);
  }

  @Post('sync-attendance')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar ocorrências a partir de faltas/atrasos da assiduidade' })
  sync(@Body() dto: SyncAttendanceDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.syncFromAttendance(dto, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma ocorrência, com histórico de alterações' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.findOne(id, user);
  }

  @Post(':id/justification')
  @ApiOperation({ summary: 'Submeter justificação' })
  justify(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitJustificationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.submitJustification(id, dto, user);
  }

  @Patch(':id/validate')
  @Roles(...REVIEWER_ROLES)
  @ApiOperation({ summary: 'Validar ou recusar justificação (recusa exige motivo)' })
  validate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ValidateAbsenceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.validate(id, dto, user);
  }

  @Post(':id/attachments')
  @ApiOperation({ summary: 'Anexar comprovativo' })
  attach(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddAbsenceAttachmentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.addAttachment(id, dto, user);
  }

  @Patch(':id')
  @Roles(...REVIEWER_ROLES)
  @ApiOperation({ summary: 'Corrigir registo (motivo obrigatório; fica na auditoria)' })
  correct(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CorrectAbsenceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.correct(id, dto, user);
  }

  @Post(':id/forward')
  @Roles(...REVIEWER_ROLES)
  @ApiOperation({ summary: 'Encaminhar para o gestor' })
  forward(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ForwardAbsenceDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.forward(id, dto, user);
  }

  @Post(':id/send-to-hr')
  @Roles(...REVIEWER_ROLES)
  @ApiOperation({ summary: 'Enviar para validação do RH' })
  sendToHr(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.sendToHr(id, user);
  }
}
