// src/automation/automation.controller.ts
import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AutomationService } from './automation.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('Automation (Automação de Processos)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'RH')
@Controller('automation')
export class AutomationController {
  constructor(private readonly svc: AutomationService) {}
 
  @Get('rules') @ApiOperation({ summary: 'Listar regras de automação' })
  rules() { return this.svc.getRules(); }
 
  @Post('rules') @ApiOperation({ summary: 'Criar regra de automação' })
  create(@Body() body: { name: string; trigger: string; condition?: string; action: string }) {
    return this.svc.createRule(body);
  }
 
  @Post('rules/init-defaults') @ApiOperation({ summary: 'Criar regras padrão de automação' })
  initDefaults() { return this.svc.initDefaultRules(); }
 
  @Post('run') @Roles('ADMIN') @ApiOperation({ summary: 'Executar todas as regras activas agora' })
  runAll() { return this.svc.runAllActiveRules(); }
 
  @Patch('rules/:id/toggle') @ApiOperation({ summary: 'Activar/desactivar regra' })
  toggle(@Param('id', ParseIntPipe) id: number) { return this.svc.toggleRule(id); }
}
 
