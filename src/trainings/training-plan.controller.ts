// src/trainings/training-plan.controller.ts
// docs/trainings-detalhado.md pt.2 — Plano de Formação.
import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { safeDownloadHeaders } from '../common/files/safe-download';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TrainingPlanService } from './training-plan.service';
import {
  CreateTrainingPlanDto,
  UpdateTrainingPlanDto,
  RejectTrainingPlanDto,
  AddTrainingToPlanDto,
  TrainingPlanFilterDto,
} from './trainings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';

import { UploadThrottle } from '../common/security/upload-throttle';

import { ADMIN_RH_LEADERSHIP_INSTRUCTOR_ROLES, ADMIN_RH_ROLES } from '../auth/enums/role-groups';
// Mesmos papéis que podem criar/gerir formações (TrainingController) —
// quem não for ADMIN/RH só gere os planos que criou (assertCanManage).
const CAN_MANAGE_PLANS = ADMIN_RH_LEADERSHIP_INSTRUCTOR_ROLES;
// Aprovar/rejeitar um plano submetido é sempre ADMIN/RH — não faz sentido
// um GESTOR aprovar o seu próprio plano.
const CAN_APPROVE_PLANS = ADMIN_RH_ROLES;

@ApiTags('Training Plans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('training-plans')
export class TrainingPlanController {
  constructor(private readonly svc: TrainingPlanService) {}

  @Get()
  @Roles(...CAN_MANAGE_PLANS)
  @ApiOperation({
    summary: 'Listar planos de formação (ADMIN/RH vêem todos; os restantes só os seus)',
  })
  findAll(@Query() filters: TrainingPlanFilterDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.findAll(filters, user);
  }

  @Get(':id')
  @Roles(...CAN_MANAGE_PLANS)
  @ApiOperation({ summary: 'Detalhe do plano de formação' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/execution')
  @Roles(...CAN_MANAGE_PLANS)
  @ApiOperation({ summary: 'Acompanhar execução — planeado vs. realizado' })
  execution(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getExecution(id);
  }

  @Get(':id/export')
  @Roles(...CAN_MANAGE_PLANS)
  @ApiOperation({ summary: 'Exportar plano de formação em CSV (por defeito) ou PDF (?format=pdf)' })
  async export(
    @Param('id', ParseIntPipe) id: number,
    @Query('format') format: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (format?.toLowerCase() === 'pdf') {
      const pdf = await this.svc.exportPdf(id);
      res.set(
        safeDownloadHeaders({ filename: `plano-formacao-${id}.pdf`, mime: 'application/pdf' }),
      );
      return new StreamableFile(pdf);
    }
    const csv = await this.svc.exportCsv(id);
    res.set(safeDownloadHeaders({ filename: 'plano-formacao.csv', mime: 'text/csv' }));
    return csv;
  }

  @UploadThrottle()
  @Post()
  @Roles(...CAN_MANAGE_PLANS)
  @ApiOperation({ summary: 'Novo plano de formação' })
  create(@Body() dto: CreateTrainingPlanDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.create(dto, user.id);
  }

  @Post(':id/duplicate')
  @Roles(...CAN_MANAGE_PLANS)
  @ApiOperation({ summary: 'Duplicar plano de formação' })
  duplicate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.duplicate(id, user);
  }

  @Put(':id')
  @Roles(...CAN_MANAGE_PLANS)
  @ApiOperation({ summary: 'Actualizar plano de formação' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTrainingPlanDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.update(id, dto, user);
  }

  @Patch(':id/submit')
  @Roles(...CAN_MANAGE_PLANS)
  @ApiOperation({ summary: 'Submeter plano para aprovação' })
  @HttpCode(HttpStatus.OK)
  submit(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.submit(id, user);
  }

  @Patch(':id/approve')
  @Roles(...CAN_APPROVE_PLANS)
  @ApiOperation({ summary: 'Aprovar plano submetido' })
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.svc.approve(id);
  }

  @Patch(':id/reject')
  @Roles(...CAN_APPROVE_PLANS)
  @ApiOperation({ summary: 'Rejeitar plano submetido' })
  @HttpCode(HttpStatus.OK)
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectTrainingPlanDto) {
    return this.svc.reject(id, dto);
  }

  @Patch(':id/publish')
  @Roles(...CAN_MANAGE_PLANS)
  @ApiOperation({ summary: 'Publicar plano aprovado' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.publish(id, user);
  }

  @Patch(':id/archive')
  @Roles(...CAN_MANAGE_PLANS)
  @ApiOperation({ summary: 'Arquivar plano de formação' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.svc.archive(id, user);
  }

  @Post(':id/trainings')
  @Roles(...CAN_MANAGE_PLANS)
  @ApiOperation({ summary: 'Adicionar formação existente ao plano' })
  addTraining(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddTrainingToPlanDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.addTraining(id, dto, user);
  }

  @Delete(':id/trainings/:trainingId')
  @Roles(...CAN_MANAGE_PLANS)
  @ApiOperation({ summary: 'Desassociar formação do plano' })
  removeTraining(
    @Param('id', ParseIntPipe) id: number,
    @Param('trainingId', ParseIntPipe) trainingId: number,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.svc.removeTraining(id, trainingId, user);
  }
}
