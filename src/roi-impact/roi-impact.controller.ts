// src/roi-impact/roi-impact.controller.ts
import {
  Controller, Get, Post, Query, Body, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RoiImpactService }  from './roi-impact.service';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../common/guards/roles.guard';
import { Roles }         from '../common/decorators';
import { RoiFilterDto, CalculateRoiDto, WhatIfDto } from './roi-impact.dto';

const ADMIN = ['ADMIN', 'RH', 'DIRECTOR'] as const;

@ApiTags('ROI & Impact')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('roi-impact')
export class RoiImpactController {
  constructor(private readonly svc: RoiImpactService) {}

  // ─── Core ROI ────────────────────────────────────────────────

  @Get('training-roi')
  @ApiOperation({ summary: '[Legacy] ROI da formação por período' })
  trainingRoi(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.calculateTrainingRoi(from, to);
  }

  @Post('calculate')
  @ApiOperation({ summary: 'Calcular ROI com parâmetros personalizados (custo, benefício)' })
  calculate(@Body() dto: CalculateRoiDto) {
    const filter: RoiFilterDto = { from: dto.from, to: dto.to, departmentId: dto.departmentId };
    return this.svc.calculateRoiFull(filter, dto);
  }

  // ─── Impact Levels (Kirkpatrick L1–L5) ───────────────────────

  @Get('impact-metrics')
  @ApiOperation({ summary: '[Legacy] Métricas de impacto organizacional' })
  impactMetrics() { return this.svc.getImpactMetrics(); }

  @Get('impact/levels')
  @ApiOperation({ summary: 'Impacto por nível Kirkpatrick: L1 Reação → L5 ROI Financeiro' })
  impactLevels(@Query() filter: RoiFilterDto) {
    return this.svc.getImpactMetrics(filter);
  }

  // ─── Domain Impacts ──────────────────────────────────────────

  @Get('impact/retention')
  @ApiOperation({ summary: 'Impacto na retenção — turnover evitado e valor monetário' })
  retentionImpact(@Query() filter: RoiFilterDto) {
    return this.svc.getRetentionImpact(filter);
  }

  @Get('impact/performance')
  @ApiOperation({ summary: 'Impacto na performance — lift de score e benefício produtivo' })
  performanceImpact(@Query() filter: RoiFilterDto) {
    return this.svc.getPerformanceImpact(filter);
  }

  @Get('impact/learning')
  @ApiOperation({ summary: 'Impacto da aprendizagem — conclusões, qualidade, ROI por programa' })
  learningImpact(@Query() filter: RoiFilterDto) {
    return this.svc.getLearningImpact(filter);
  }

  // ─── Executive Dashboard ──────────────────────────────────────

  @Get('executive')
  @ApiOperation({ summary: 'Dashboard executivo — ROI total + todos os domínios + narrativa automática' })
  executive(@Query() filter: RoiFilterDto) {
    return this.svc.getExecutiveDashboard(filter);
  }

  // ─── Program Library ─────────────────────────────────────────

  @Get('programs')
  @ApiOperation({ summary: 'Biblioteca de programas — ranking por ROI e eficácia' })
  programs(@Query() filter: RoiFilterDto) {
    return this.svc.getProgramLibrary(filter);
  }

  // ─── What-If Simulator ────────────────────────────────────────

  @Post('simulate')
  @ApiOperation({ summary: 'Simulador What-If — projectar ROI com diferentes cenários' })
  simulate(@Body() dto: WhatIfDto) {
    return this.svc.simulateWhatIf(dto);
  }
}



