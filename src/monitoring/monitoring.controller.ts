import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import { MonitoringService } from './monitoring.service';
import {
  CreateOkrCycleDto,
  CreateObjectiveDto,
  CreateKeyResultDto,
  UpdateKeyResultDto,
  CreateIndicatorDto,
  CreateRecordDto,
  CreateEvalCycleDto,
  SubmitEvaluationDto,
} from './dto';

@ApiTags('Monitoria e Avaliação')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly service: MonitoringService) {}

  // ─── DASHBOARD ───────────────────────────────────────

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Dashboard de Monitoria e Avaliação' })
  getDashboard() {
    return this.service.getDashboard();
  }

  // ─── OKRs ────────────────────────────────────────────

  @Post('okr/cycles')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar ciclo OKR' })
  createOkrCycle(@Body() dto: CreateOkrCycleDto, @CurrentUser() user: any) {
    return this.service.createOkrCycle(dto, user.id);
  }

  @Get('okr/cycles')
  @ApiOperation({ summary: 'Listar ciclos OKR' })
  findAllCycles() {
    return this.service.findAllCycles();
  }

  @Post('okr/objectives')
  @ApiOperation({ summary: 'Criar objectivo' })
  createObjective(@Body() dto: CreateObjectiveDto, @CurrentUser() user: any) {
    return this.service.createObjective(dto, user.id);
  }

  @Get('okr/cycles/:cycleId/objectives')
  @ApiOperation({ summary: 'Objectivos de um ciclo' })
  findObjectives(@Param('cycleId') cycleId: string, @Query('ownerId') ownerId?: string) {
    return this.service.findObjectives(cycleId, ownerId ? Number(ownerId) : undefined);
  }

  @Post('okr/key-results')
  @ApiOperation({ summary: 'Criar Key Result' })
  createKeyResult(@Body() dto: CreateKeyResultDto, @CurrentUser() user: any) {
    return this.service.createKeyResult(dto, user.id);
  }

  @Put('okr/key-results/:id')
  @ApiOperation({ summary: 'Actualizar progresso do Key Result' })
  updateKeyResult(
    @Param('id') id: string,
    @Body() dto: UpdateKeyResultDto,
    @CurrentUser() user: any,
  ) {
    return this.service.updateKeyResult(id, dto, user.id);
  }

  // ─── INDICADORES ─────────────────────────────────────

  @Post('indicators')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar indicador de monitoria' })
  createIndicator(@Body() dto: CreateIndicatorDto, @CurrentUser() user: any) {
    return this.service.createIndicator(dto, user.id);
  }

  @Get('indicators')
  @ApiOperation({ summary: 'Listar indicadores (paginado)' })
  findAllIndicators(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('category') category?: string,
  ) {
    return this.service.findAllIndicators(page, limit, category);
  }

  @Post('indicators/:id/records')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Registar valor do indicador' })
  addRecord(@Param('id') id: string, @Body() dto: CreateRecordDto, @CurrentUser() user: any) {
    return this.service.addRecord(id, dto, user.id);
  }

  @Get('indicators/:id/history')
  @ApiOperation({ summary: 'Histórico do indicador' })
  getIndicatorHistory(@Param('id') id: string) {
    return this.service.getIndicatorHistory(id);
  }

  // ─── AVALIAÇÃO ───────────────────────────────────────

  @Post('evaluation/cycles')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar ciclo de avaliação' })
  createEvalCycle(@Body() dto: CreateEvalCycleDto, @CurrentUser() user: any) {
    return this.service.createEvalCycle(dto, user.id);
  }

  @Post('evaluation/cycles/:cycleId/assign')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Atribuir avaliação' })
  assignEvaluation(
    @Param('cycleId') cycleId: string,
    @Body('userId', ParseIntPipe) userId: number,
    @Body('evaluatorId', ParseIntPipe) evaluatorId: number,
    @Body('type') type: string,
    @CurrentUser() user: any,
  ) {
    return this.service.assignEvaluation(cycleId, userId, evaluatorId, type || 'MANAGER', user.id);
  }

  @Put('evaluation/:id/submit')
  @ApiOperation({ summary: 'Submeter avaliação' })
  submitEvaluation(
    @Param('id') id: string,
    @Body() dto: SubmitEvaluationDto,
    @CurrentUser() user: any,
  ) {
    return this.service.submitEvaluation(id, dto, user.id);
  }

  @Get('evaluation/my-evaluations')
  @ApiOperation({ summary: 'As minhas avaliações' })
  getMyEvaluations(@CurrentUser() user: any) {
    return this.service.getMyEvaluations(user.id);
  }

  @Get('evaluation/to-complete')
  @ApiOperation({ summary: 'Avaliações que tenho de completar' })
  getEvaluationsToComplete(@CurrentUser() user: any) {
    return this.service.getEvaluationsToComplete(user.id);
  }
}
