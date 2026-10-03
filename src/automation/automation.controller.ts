// src/automation/automation.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AutomationService } from './automation.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import {
  CreateRuleDto,
  UpdateRuleDto,
  TriggerEventDto,
  ExecutionFilterDto,
  RuleFilterDto,
  OverviewFilterDto,
} from './automation.dto';
import { Role } from '../auth/enums/role.enum';

const ADMIN = ['ADMIN', 'RH'] as const;

@ApiTags('Automation — Workflow Engine')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('automation')
export class AutomationController {
  constructor(private readonly svc: AutomationService) {}

  // ─── Rules ────────────────────────────────────────────────────

  @Get('rules')
  @ApiOperation({ summary: 'Listar regras com stats de execução' })
  rules(@Query() filters: RuleFilterDto) {
    return this.svc.getRules(filters);
  }

  @Get('rules/export')
  @ApiOperation({ summary: 'Exportar a listagem filtrada de regras (CSV)' })
  async exportRules(@Query() filters: RuleFilterDto) {
    const content = await this.svc.exportRulesCsv(filters);
    return { filename: `automacoes-${new Date().toISOString().slice(0, 10)}.csv`, content };
  }

  @Get('modules')
  @ApiOperation({ summary: 'Módulos de origem existentes (filtro)' })
  modules() {
    return this.svc.getModules();
  }

  @Get('overview')
  @ApiOperation({ summary: 'Visão Geral — cards e gráficos filtráveis por período/módulo/estado' })
  overview(@Query() filters: OverviewFilterDto) {
    return this.svc.getOverview(filters);
  }

  @Post('rules/:id/run')
  @ApiOperation({ summary: 'Executar manualmente uma regra (a UI exige confirmação)' })
  runOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.runRule(id, { manual: true }, user.id);
  }

  @Post('rules')
  @ApiOperation({ summary: 'Criar regra de automação (trigger → condition → action)' })
  create(@Body() dto: CreateRuleDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createRule(dto, user.id);
  }

  @Put('rules/:id')
  @ApiOperation({ summary: 'Actualizar regra' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRuleDto) {
    return this.svc.updateRule(id, dto);
  }

  @Patch('rules/:id/toggle')
  @ApiOperation({ summary: 'Activar/desactivar regra' })
  toggle(@Param('id', ParseIntPipe) id: number) {
    return this.svc.toggleRule(id);
  }

  @Post('rules/:id/clone')
  @ApiOperation({ summary: 'Clonar regra (cria cópia inactiva)' })
  clone(@Param('id', ParseIntPipe) id: number) {
    return this.svc.cloneRule(id);
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover regra' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteRule(id);
  }

  // ─── Execution ────────────────────────────────────────────────

  @Post('run')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Executar manualmente todas as regras activas' })
  runAll() {
    return this.svc.runAllActiveRules();
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Disparar evento e executar automações correspondentes' })
  trigger(@Body() dto: TriggerEventDto) {
    return this.svc.triggerEvent(dto);
  }

  // ─── Executions ───────────────────────────────────────────────

  @Get('executions')
  @ApiOperation({ summary: 'Histórico de execuções (filtrar por status, regra, período)' })
  executions(@Query() filters: ExecutionFilterDto) {
    return this.svc.getExecutions(filters);
  }

  @Post('executions/:id/rerun')
  @ApiOperation({ summary: 'Re-executar uma execução falhada' })
  rerun(@Param('id') id: string) {
    return this.svc.rerunExecution(id);
  }

  // ─── Stats ────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard — total de regras, taxa de sucesso, por categoria' })
  stats() {
    return this.svc.getStats();
  }

  // ─── Templates ────────────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: 'Biblioteca de templates pré-configurados (7 built-in)' })
  templates() {
    return this.svc.getTemplates();
  }

  @Post('templates/:index/apply')
  @ApiOperation({ summary: 'Aplicar template à lista de automações' })
  applyTemplate(@Param('index', ParseIntPipe) index: number) {
    return this.svc.applyTemplate(index);
  }

  // ─── Init defaults (legacy) ───────────────────────────────────

  @Post('rules/init-defaults')
  @ApiOperation({ summary: '[Legacy] Criar regras padrão se não existirem' })
  initDefaults() {
    return this.svc.initDefaultRules();
  }
}
