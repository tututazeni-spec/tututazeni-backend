// src/roi-impact/roi-analysis.controller.ts
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
import { RoiAnalysisService } from './roi-analysis.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, CurrentUser, CurrentUserData } from '../common/decorators';
import {
  CreateRoiAnalysisDto,
  UpdateRoiAnalysisDto,
  ComputeRoiAnalysisDto,
  ApproveRoiAnalysisDto,
  RoiAnalysisFilterDto,
  RoiInitiativeType,
} from './roi-impact.dto';

const ADMIN = ['ADMIN', 'RH', 'DIRECTOR'] as const;

@ApiTags('ROI & Impact — ROI da Formação')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('roi-impact/analyses')
export class RoiAnalysisController {
  constructor(private readonly svc: RoiAnalysisService) {}

  @Get()
  @ApiOperation({ summary: 'Tabela de análises de ROI da formação' })
  findAll(@Query() filter: RoiAnalysisFilterDto) {
    return this.svc.findAll(filter);
  }

  @Get('initiative-options')
  @ApiOperation({ summary: 'Opções de iniciativa para a Etapa 1 do wizard, por tipo' })
  initiativeOptions(@Query('type') type: RoiInitiativeType) {
    return this.svc.listInitiativeOptions(type);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de uma análise de ROI' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Etapa 1 — Identificação: cria a análise' })
  create(@Body() dto: CreateRoiAnalysisDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Etapas 2–4 — Custos / Benefícios esperados / Metodologia' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoiAnalysisDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/compute')
  @ApiOperation({ summary: 'Etapa 5 — Resultado: calcula ROI/BCR/payback/confiança' })
  compute(@Param('id', ParseIntPipe) id: number, @Body() dto: ComputeRoiAnalysisDto) {
    return this.svc.computeResult(id, dto);
  }

  @Post(':id/approve')
  @ApiOperation({ summary: 'Etapa 5 — Aprovação: valida ou revê o resultado' })
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveRoiAnalysisDto) {
    return this.svc.approve(id, dto);
  }
}
