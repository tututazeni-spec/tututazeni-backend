// src/audit/audit-incidents.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditIncidentsService } from './audit-incidents.service';
import {
  AssignIncidentDto,
  CreateIncidentDto,
  IncidentEvidenceDto,
  IncidentFilterDto,
  IncidentStatusDto,
  UpdateIncidentDto,
} from './audit-incidents.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

// Registado ANTES de AuditController no módulo: 'audit/incidents' não pode ser
// engolido por 'audit/:id'.
@ApiTags('Audit — Incidentes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.AUDITOR)
@Controller('audit/incidents')
export class AuditIncidentsController {
  constructor(private readonly svc: AuditIncidentsService) {}

  private actor(user: CurrentUserData, req: { ip?: string }) {
    return { id: user.id, ip: req.ip };
  }

  @Get()
  @ApiOperation({ summary: 'Listar incidentes de segurança' })
  list(@Query() filters: IncidentFilterDto) {
    return this.svc.list(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do incidente: evidências e histórico' })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Registar incidente' })
  create(
    @Body() dto: CreateIncidentDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.create(dto, this.actor(user, req));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar título, descrição, categoria, tipo ou gravidade' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateIncidentDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.update(id, dto, this.actor(user, req));
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Atribuir responsável pela análise' })
  assign(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignIncidentDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.assign(id, dto, this.actor(user, req));
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Mudar estado (aberto → em análise → mitigado → encerrado)' })
  status(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IncidentStatusDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.changeStatus(id, dto, this.actor(user, req));
  }

  @Post(':id/evidences')
  @ApiOperation({ summary: 'Anexar evidência (evento de auditoria e/ou nota)' })
  evidence(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: IncidentEvidenceDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.addEvidence(id, dto, this.actor(user, req));
  }
}
