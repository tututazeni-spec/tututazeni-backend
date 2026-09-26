// src/roi-impact/impact-record.controller.ts
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
import { ImpactRecordService } from './impact-record.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, CurrentUser, CurrentUserData } from '../common/decorators';
import {
  CreateImpactRecordDto,
  UpdateImpactRecordDto,
  ValidateImpactRecordDto,
  ImpactRecordFilterDto,
} from './roi-impact.dto';

const ADMIN = ['ADMIN', 'RH', 'DIRECTOR'] as const;

@ApiTags('ROI & Impact — Impacto no Negócio')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('roi-impact/impact-records')
export class ImpactRecordController {
  constructor(private readonly svc: ImpactRecordService) {}

  @Get()
  @ApiOperation({ summary: 'Tabela de impacto no negócio' })
  findAll(@Query() filter: ImpactRecordFilterDto) {
    return this.svc.findAll(filter);
  }

  @Get('by-category')
  @ApiOperation({ summary: 'Resumo por categoria de impacto' })
  byCategory(@Query() filter: ImpactRecordFilterDto) {
    return this.svc.getCategorySummary(filter);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um registo de impacto' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Novo registo de impacto no negócio' })
  create(@Body() dto: CreateImpactRecordDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar registo de impacto' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateImpactRecordDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/validate')
  @ApiOperation({ summary: 'Validar registo de impacto' })
  validate(@Param('id', ParseIntPipe) id: number, @Body() dto: ValidateImpactRecordDto) {
    return this.svc.validate(id, dto);
  }
}
