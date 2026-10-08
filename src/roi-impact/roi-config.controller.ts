// src/roi-impact/roi-config.controller.ts
import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RoiConfigService } from './roi-config.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, CurrentUser, CurrentUserData } from '../common/decorators';
import { UpdateRoiConfigDto } from './roi-impact.dto';

const ADMIN = ['ADMIN', 'RH', 'DIRECTOR'] as const;

@ApiTags('ROI & Impact — Configurações')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('roi-impact/config')
export class RoiConfigController {
  constructor(private readonly svc: RoiConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Configurações do módulo ROI & Impact (moeda, thresholds, alertas)' })
  getConfig() {
    return this.svc.getConfig();
  }

  @Patch()
  @ApiOperation({ summary: 'Actualiza as configurações do módulo ROI & Impact' })
  updateConfig(@Body() dto: UpdateRoiConfigDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.updateConfig(user.id, dto);
  }
}
