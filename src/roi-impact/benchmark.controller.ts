// src/roi-impact/benchmark.controller.ts
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
import { BenchmarkService } from './benchmark.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, CurrentUser, CurrentUserData } from '../common/decorators';
import {
  CreateBenchmarkDto,
  UpdateBenchmarkDto,
  BenchmarkFilterDto,
  BenchmarkComparisonFilterDto,
} from './roi-impact.dto';

const ADMIN = ['ADMIN', 'RH', 'DIRECTOR'] as const;

@ApiTags('ROI & Impact — Benchmarks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('roi-impact/benchmarks')
export class BenchmarkController {
  constructor(private readonly svc: BenchmarkService) {}

  @Get()
  @ApiOperation({ summary: 'Lista benchmarks internos/externos registados' })
  findAll(@Query() filter: BenchmarkFilterDto) {
    return this.svc.findAll(filter);
  }

  @Get('internal-comparisons')
  @ApiOperation({
    summary:
      'Comparações internas por departamento/unidade/ciclo e melhor/pior por tipo de iniciativa',
  })
  internalComparisons(@Query() filter: BenchmarkComparisonFilterDto) {
    return this.svc.getInternalComparisons(filter);
  }

  @Get('sector-roi-comparison')
  @ApiOperation({ summary: 'ROI médio da Academia vs. benchmarks externos de ROI' })
  sectorRoiComparison() {
    return this.svc.getSectorRoiComparison();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um benchmark' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Regista um novo benchmark' })
  create(@Body() dto: CreateBenchmarkDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita um benchmark' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBenchmarkDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove um benchmark' })
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.svc.remove(id);
    return { success: true };
  }
}
