// src/roi-impact/scenario.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ScenarioService } from './scenario.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, CurrentUser, CurrentUserData } from '../common/decorators';
import {
  CreateScenarioDto,
  UpdateScenarioDto,
  ScenarioFilterDto,
  CompareScenariosDto,
} from './roi-impact.dto';

const ADMIN = ['ADMIN', 'RH', 'DIRECTOR'] as const;

@ApiTags('ROI & Impact — Cenários & Simulações')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('roi-impact/scenarios')
export class ScenarioController {
  constructor(private readonly svc: ScenarioService) {}

  @Get()
  @ApiOperation({ summary: 'Lista cenários simulados' })
  findAll(@Query() filter: ScenarioFilterDto) {
    return this.svc.findAll(filter);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalhe de um cenário (inclui projecções Otimista/Realista/Pessimista)',
  })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Cria um novo cenário simulado' })
  create(@Body() dto: CreateScenarioDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.create(dto, user.id);
  }

  @Post('compare')
  @ApiOperation({ summary: 'Compara cenários alternativos por ROI/payback projectados' })
  compare(@Body() dto: CompareScenariosDto) {
    return this.svc.compare(dto.ids);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza um cenário e recalcula projecções quando aplicável' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateScenarioDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove um cenário' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
    return { success: true };
  }
}
