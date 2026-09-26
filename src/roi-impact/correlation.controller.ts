// src/roi-impact/correlation.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  ParseIntPipe,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CorrelationService } from './correlation.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, CurrentUser, CurrentUserData } from '../common/decorators';
import { RunCorrelationDto, CorrelationFilterDto } from './roi-impact.dto';

const ADMIN = ['ADMIN', 'RH', 'DIRECTOR'] as const;

@ApiTags('ROI & Impact — Correlações')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('roi-impact/correlations')
export class CorrelationController {
  constructor(private readonly svc: CorrelationService) {}

  @Get('definitions')
  @ApiOperation({ summary: 'Análises de correlação disponíveis (predefinidas no spec)' })
  definitions() {
    return this.svc.listDefinitions();
  }

  @Get()
  @ApiOperation({ summary: 'Histórico de correlações executadas' })
  findAll(@Query() filter: CorrelationFilterDto) {
    return this.svc.findAll(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma correlação (inclui pontos de dispersão)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Executa uma análise de correlação predefinida' })
  run(@Body() dto: RunCorrelationDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.run(dto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove uma correlação do histórico' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
    return { success: true };
  }
}
