// src/roi-impact/kpi-definition.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  ParseIntPipe,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KpiDefinitionService } from './kpi-definition.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, CurrentUser, CurrentUserData } from '../common/decorators';
import {
  CreateKpiDefinitionDto,
  UpdateKpiDefinitionDto,
  KpiDefinitionFilterDto,
} from './roi-impact.dto';

const ADMIN = ['ADMIN', 'RH', 'DIRECTOR'] as const;

@ApiTags('ROI & Impact — Indicadores & KPIs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('roi-impact/kpis')
export class KpiDefinitionController {
  constructor(private readonly svc: KpiDefinitionService) {}

  @Get()
  @ApiOperation({ summary: 'Biblioteca central de KPIs' })
  findAll(@Query() filter: KpiDefinitionFilterDto) {
    return this.svc.findAll(filter);
  }

  @Get('by-category')
  @ApiOperation({ summary: 'Resumo de KPIs por categoria' })
  byCategory() {
    return this.svc.getCategorySummary();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um KPI' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Novo KPI na biblioteca' })
  create(@Body() dto: CreateKpiDefinitionDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar KPI' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateKpiDefinitionDto) {
    return this.svc.update(id, dto);
  }
}
