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
import { Roles } from '../common/decorators';
import {
  CreateRuleDto,
  UpdateRuleDto,
  TriggerEventDto,
  ExecutionFilterDto,
  AutomationCategory,
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
  rules(@Query('category') category?: AutomationCategory) {
    return this.svc.getRules(category);
  }

  @Post('rules')
  @ApiOperation({ summary: 'Criar regra de automação (trigger → condition → action)' })
  create(@Body() dto: CreateRuleDto) {
    return this.svc.createRule(dto);
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
  rerun(@Param('id', ParseIntPipe) id: number) {
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
