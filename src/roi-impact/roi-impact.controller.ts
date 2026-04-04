// src/roi-impact/roi-impact.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RoiImpactService } from './roi-impact.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('ROI & Impact (Impacto e Retorno do Investimento)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'DIRECTOR', 'RH')
@Controller('roi-impact')
export class RoiImpactController {
  constructor(private readonly svc: RoiImpactService) {}
 
  @Get('training-roi') @ApiOperation({ summary: 'ROI da formação — custo vs benefício estimado' })
  trainingRoi(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.calculateTrainingRoi(from, to);
  }
 
  @Get('impact-metrics') @ApiOperation({ summary: 'Métricas de impacto organizacional' })
  impactMetrics() { return this.svc.getImpactMetrics(); }
}
 
