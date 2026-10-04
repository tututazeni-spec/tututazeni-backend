// src/audit/audit-internal.controller.ts
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
import { AuditInternalService } from './audit-internal.service';
import {
  ApproveAuditReportDto,
  AuditActionDto,
  AuditCheckDto,
  AuditEvidenceDto,
  AuditFindingDto,
  AuditStatusDto,
  CreateInternalAuditDto,
  InternalAuditFilterDto,
  UpdateAuditActionDto,
  UpdateAuditCheckDto,
  UpdateInternalAuditDto,
} from './audit-internal.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

// Registado ANTES de AuditController no módulo: 'audit/audits' não pode ser
// engolido por 'audit/:id'.
@ApiTags('Audit — Auditorias internas')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.RH)
@Controller('audit/audits')
export class AuditInternalController {
  constructor(private readonly svc: AuditInternalService) {}

  private actor(user: CurrentUserData, req: { ip?: string }) {
    return { id: user.id, ip: req.ip };
  }

  @Get()
  @ApiOperation({ summary: 'Listar auditorias internas' })
  list(@Query() filters: InternalAuditFilterDto) {
    return this.svc.list(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe: verificações, evidências, constatações, ações, histórico' })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.svc.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Nova auditoria' })
  create(
    @Body() dto: CreateInternalAuditDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.create(dto, this.actor(user, req));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar dados da auditoria (antes da revisão)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInternalAuditDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.update(id, dto, this.actor(user, req));
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Mudar estado (preparar, executar, submeter para revisão, cancelar)' })
  status(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AuditStatusDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.changeStatus(id, dto, this.actor(user, req));
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Aprovar o relatório final (registado como evento de auditoria)' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveAuditReportDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.approveReport(id, dto, this.actor(user, req));
  }

  @Get(':id/export')
  @ApiOperation({ summary: 'Exportar relatório final (Markdown); regista a exportação' })
  export(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.exportReport(id, this.actor(user, req));
  }

  @Post(':id/checks')
  @ApiOperation({ summary: 'Adicionar verificação' })
  addCheck(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AuditCheckDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.addCheck(id, dto, this.actor(user, req));
  }

  @Patch(':id/checks/:checkId')
  @ApiOperation({ summary: 'Atualizar resultado de uma verificação' })
  updateCheck(
    @Param('id', ParseIntPipe) id: number,
    @Param('checkId', ParseIntPipe) checkId: number,
    @Body() dto: UpdateAuditCheckDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.updateCheck(id, checkId, dto, this.actor(user, req));
  }

  @Post(':id/evidences')
  @ApiOperation({ summary: 'Anexar evidência' })
  addEvidence(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AuditEvidenceDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.addEvidence(id, dto, this.actor(user, req));
  }

  @Post(':id/findings')
  @ApiOperation({ summary: 'Registar constatação / não conformidade' })
  addFinding(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AuditFindingDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.addFinding(id, dto, this.actor(user, req));
  }

  @Post(':id/actions')
  @ApiOperation({ summary: 'Criar ação corretiva' })
  addAction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AuditActionDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.addAction(id, dto, this.actor(user, req));
  }

  @Patch(':id/actions/:actionId')
  @ApiOperation({ summary: 'Atualizar estado de uma ação corretiva' })
  updateAction(
    @Param('id', ParseIntPipe) id: number,
    @Param('actionId', ParseIntPipe) actionId: number,
    @Body() dto: UpdateAuditActionDto,
    @CurrentUser() user: CurrentUserData,
    @Req() req: { ip?: string },
  ) {
    return this.svc.updateAction(id, actionId, dto, this.actor(user, req));
  }
}
