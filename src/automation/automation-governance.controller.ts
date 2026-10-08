// src/automation/automation-governance.controller.ts
// §10 (configurações, segurança e controlo), §11 (modelos) e §12 (ligações, auditoria,
// dead letter). Separado do controller principal; mesmas guardas e mesmo prefixo.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { AutomationService } from './automation.service';
import { AutomationAccessService } from './automation-access.service';
import { AutomationAuditService } from './automation-audit.service';
import { AutomationSettingsService } from './automation-settings.service';
import { AutomationConnectionsService } from './automation-connections.service';
import { AutomationFailuresService } from './automation-failures.service';
import { AutomationRetentionService } from './automation-retention.service';
import { AutomationTemplatesService } from './automation-templates.service';
import { AutomationHealthService } from './automation-health.service';
import { AutomationPerm } from './automation-permission.guard';
import {
  AuditFilterDto,
  ConnectionFilterDto,
  CreateConnectionDto,
  DeadLetterFilterDto,
  DecidePublishDto,
  InstantiateTemplateDto,
  RetentionRunDto,
  TemplateFilterDto,
  UpdateAutomationSettingsDto,
  UpdateConnectionDto,
  UpdateRolePermissionDto,
} from './automation-governance.dto';

@ApiTags('Automation — Governança')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'RH')
@Controller('automation')
export class AutomationGovernanceController {
  constructor(
    private readonly svc: AutomationService,
    private readonly access: AutomationAccessService,
    private readonly audit: AutomationAuditService,
    private readonly settings: AutomationSettingsService,
    private readonly connections: AutomationConnectionsService,
    private readonly failures: AutomationFailuresService,
    private readonly retention: AutomationRetentionService,
    private readonly templates: AutomationTemplatesService,
    private readonly health: AutomationHealthService,
  ) {}

  // ─── Monitorização (§13) ──────────────────────────────────────
  @Get('health')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Saúde do motor: execuções presas, retries, agendamentos, dead letters',
  })
  getHealth() {
    return this.health.getHealth();
  }

  // ─── Limites, alertas e retenção (§10) ────────────────────────

  @Get('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Limites de frequência/concorrência, alertas, retenção e aprovação' })
  getSettings() {
    return this.settings.getDetail();
  }

  @Put('settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Alterar as definições (fica auditado, antes/depois)' })
  updateSettings(@Body() dto: UpdateAutomationSettingsDto, @CurrentUser() user: CurrentUserData) {
    return this.settings.update(dto, user.id);
  }

  @Post('retention/run')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aplicar já a retenção/arquivo (dryRun: só conta)' })
  runRetention(@Body() dto: RetentionRunDto, @CurrentUser() user: CurrentUserData) {
    return this.retention.run({ dryRun: dto.dryRun ?? false, userId: user.id });
  }

  // ─── Permissões por perfil (§10) ──────────────────────────────

  @Get('permissions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Matriz de permissões por perfil (consultar … eliminar) e âmbito' })
  permissions() {
    return this.access.matrix();
  }

  @Get('permissions/me')
  @ApiOperation({ summary: 'Permissões do utilizador autenticado (a UI esconde o que não pode)' })
  async myPermissions(@CurrentUser() user: CurrentUserData) {
    return this.access.grantFor(user.role?.name ?? '');
  }

  @Put('permissions/:roleCode')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Alterar as permissões de um perfil (ADMIN não é editável)' })
  updatePermissions(
    @Param('roleCode') roleCode: string,
    @Body() dto: UpdateRolePermissionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.access.updateRole(roleCode, dto, user.id);
  }

  // ─── Aprovação de publicação (§10) ────────────────────────────

  @Get('publications/pending')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Automações críticas à espera de aprovação de publicação' })
  pendingPublications() {
    return this.svc.pendingPublications();
  }

  @Post('rules/:id/publication/approve')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aprovar a publicação (quem pediu não pode aprovar)' })
  approvePublication(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidePublishDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.approvePublication(id, user.id, dto.note);
  }

  @Post('rules/:id/publication/reject')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recusar a publicação (motivo obrigatório)' })
  rejectPublication(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecidePublishDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.rejectPublication(id, user.id, dto.note);
  }

  // ─── Auditoria (§10/§12) ──────────────────────────────────────

  @Get('audit')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Auditoria do módulo: quem alterou o quê e quando' })
  auditList(@Query() filters: AuditFilterDto) {
    return this.audit.list(filters);
  }

  @Get('audit/export')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Exportar a auditoria filtrada (CSV)' })
  async auditExport(@Query() filters: AuditFilterDto) {
    const content = await this.audit.exportCsv(filters);
    return {
      filename: `auditoria-automacoes-${new Date().toISOString().slice(0, 10)}.csv`,
      content,
    };
  }

  @Get('rules/:id/audit')
  @AutomationPerm('view', 'id')
  @ApiOperation({ summary: 'Histórico de alterações de uma automação' })
  ruleAudit(@Param('id', ParseIntPipe) id: number, @Query() filters: AuditFilterDto) {
    return this.audit.list({ ...filters, ruleId: id });
  }

  // ─── Ligações e segredos (§10/§12) ────────────────────────────

  @Get('connections')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Ligações autorizadas (o segredo nunca é devolvido)' })
  listConnections(@Query() filters: ConnectionFilterDto) {
    return this.connections.list(filters);
  }

  @Post('connections')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Criar ligação (segredo cifrado em repouso)' })
  createConnection(@Body() dto: CreateConnectionDto, @CurrentUser() user: CurrentUserData) {
    return this.connections.create(dto, user.id);
  }

  @Get('connections/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Detalhe da ligação' })
  getConnection(@Param('id') id: string) {
    return this.connections.get(id);
  }

  @Put('connections/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Editar ligação / rodar o segredo' })
  updateConnection(
    @Param('id') id: string,
    @Body() dto: UpdateConnectionDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.connections.update(id, dto, user.id);
  }

  @Post('connections/:id/test')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Testar a ligação' })
  testConnection(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.connections.test(id, user.id);
  }

  @Delete('connections/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remover ligação' })
  removeConnection(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.connections.remove(id, user.id);
  }

  // ─── Dead letter (§12) ────────────────────────────────────────

  @Get('dead-letters')
  @AutomationPerm('view')
  @ApiOperation({ summary: 'Execuções que falharam depois de esgotadas as tentativas' })
  async deadLetters(@Query() filters: DeadLetterFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.failures.list(filters, await this.access.scopedRuleIds(user));
  }

  @Get('dead-letters/summary')
  @AutomationPerm('view')
  @ApiOperation({ summary: 'Totais por estado' })
  async deadLetterSummary(@CurrentUser() user: CurrentUserData) {
    return this.failures.summary(await this.access.scopedRuleIds(user));
  }

  @Get('dead-letters/export')
  @AutomationPerm('view')
  @ApiOperation({ summary: 'Exportar (CSV)' })
  async deadLetterExport(
    @Query() filters: DeadLetterFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const content = await this.failures.exportCsv(filters, await this.access.scopedRuleIds(user));
    return { filename: `dead-letters-${new Date().toISOString().slice(0, 10)}.csv`, content };
  }

  @Post('dead-letters/:id/reprocess')
  @AutomationPerm('execute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reprocessar: reexecuta a execução original' })
  reprocessDeadLetter(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.failures.reprocess(id, user.id, execId => this.svc.rerunExecution(execId));
  }

  @Patch('dead-letters/:id/discard')
  @AutomationPerm('edit')
  @ApiOperation({ summary: 'Descartar (fica registado quem e porquê)' })
  discardDeadLetter(
    @Param('id') id: string,
    @Body() dto: DecidePublishDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.failures.discard(id, user.id, dto.note);
  }

  // ─── Modelos pré-configurados (§11) ───────────────────────────

  @Get('template-library')
  @AutomationPerm('view')
  @ApiOperation({ summary: 'Modelos prontos a configurar (gatilho, acções, campos a preencher)' })
  templateLibrary(@Query() filters: TemplateFilterDto) {
    return this.templates.list(filters);
  }

  @Get('template-library/:key')
  @AutomationPerm('view')
  @ApiOperation({ summary: 'Detalhe de um modelo' })
  templateDetail(@Param('key') key: string) {
    return this.templates.get(key);
  }

  @Post('template-library/:key/instantiate')
  @AutomationPerm('create')
  @ApiOperation({ summary: 'Criar uma automação (rascunho) a partir do modelo' })
  instantiateTemplate(
    @Param('key') key: string,
    @Body() dto: InstantiateTemplateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.templates.instantiate(key, dto, user.id);
  }
}
