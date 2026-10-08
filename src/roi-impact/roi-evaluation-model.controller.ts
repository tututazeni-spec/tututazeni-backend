// src/roi-impact/roi-evaluation-model.controller.ts
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
import { RoiEvaluationModelService } from './roi-evaluation-model.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles, CurrentUser, CurrentUserData } from '../common/decorators';
import {
  CreateRoiEvaluationModelDto,
  UpdateRoiEvaluationModelDto,
  RoiModelStatus,
} from './roi-impact.dto';

const ADMIN = ['ADMIN', 'RH', 'DIRECTOR'] as const;

@ApiTags('ROI & Impact — Modelos de Avaliação')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('roi-impact/evaluation-models')
export class RoiEvaluationModelController {
  constructor(private readonly svc: RoiEvaluationModelService) {}

  @Get()
  @ApiOperation({
    summary: 'Biblioteca de modelos de avaliação (Kirkpatrick/Phillips/personalizado)',
  })
  findAll(@Query('status') status?: RoiModelStatus) {
    return this.svc.findAll(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um modelo de avaliação' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Novo modelo de avaliação personalizado' })
  create(@Body() dto: CreateRoiEvaluationModelDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.create(dto, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Editar modelo de avaliação' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoiEvaluationModelDto) {
    return this.svc.update(id, dto);
  }
}
