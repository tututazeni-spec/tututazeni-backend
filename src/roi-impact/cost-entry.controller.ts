// src/roi-impact/cost-entry.controller.ts
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
import { CostEntryService } from './cost-entry.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, CurrentUser, CurrentUserData } from '../common/decorators';
import {
  CreateCostEntryDto,
  UpdateCostEntryDto,
  CostEntryFilterDto,
  EstimateLaborCostDto,
} from './roi-impact.dto';

const ADMIN = ['ADMIN', 'RH', 'DIRECTOR'] as const;

@ApiTags('ROI & Impact — Custos & Investimento')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('roi-impact/costs')
export class CostEntryController {
  constructor(private readonly svc: CostEntryService) {}

  @Get()
  @ApiOperation({ summary: 'Linhas de custo (diretos/indiretos/oportunidade)' })
  findAll(@Query() filter: CostEntryFilterDto) {
    return this.svc.findAll(filter);
  }

  @Get('consolidation')
  @ApiOperation({ summary: 'Consolidação de custo por iniciativa (docs/roi-impact.md §5)' })
  consolidation(@Query() filter: CostEntryFilterDto) {
    return this.svc.getConsolidation(filter);
  }

  @Post('estimate-labor-cost')
  @ApiOperation({ summary: 'Estima custo de horas perdidas a partir do salário/hora (Payroll)' })
  estimateLaborCost(@Body() dto: EstimateLaborCostDto) {
    return this.svc.estimateLaborCost(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Nova linha de custo' })
  create(@Body() dto: CreateCostEntryDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar linha de custo' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCostEntryDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remover linha de custo' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }
}
