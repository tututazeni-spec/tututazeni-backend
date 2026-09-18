import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MonitoringEvalType } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { MonitoringService } from './monitoring.service';
import {
  CreateIndicatorDto,
  CreateRecordDto,
  CreateEvalCycleDto,
  MonitoringSubmitEvaluationDto,
  FilterIndicatorDto,
} from './dto';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Monitoria e Avaliação')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('monitoring')
export class MonitoringController {
  constructor(private readonly service: MonitoringService) {}

  // ─── DASHBOARD ───────────────────────────────────────

  @Get('dashboard')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Dashboard de Monitoria e Avaliação' })
  getDashboard() {
    return this.service.getDashboard();
  }

  // ─── INDICADORES ─────────────────────────────────────

  @Post('indicators')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Criar indicador de monitoria' })
  createIndicator(@Body() dto: CreateIndicatorDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createIndicator(dto, user.id);
  }

  @Get('indicators')
  @ApiOperation({ summary: 'Listar indicadores (paginado)' })
  findAllIndicators(@Query() filters: FilterIndicatorDto) {
    return this.service.findAllIndicators(filters);
  }

  @Post('indicators/:id/records')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Registar valor do indicador' })
  addRecord(
    @Param('id') id: string,
    @Body() dto: CreateRecordDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.addRecord(id, dto, user.id);
  }

  @Get('indicators/:id/history')
  @ApiOperation({ summary: 'Histórico do indicador' })
  getIndicatorHistory(@Param('id') id: string) {
    return this.service.getIndicatorHistory(id);
  }

  // ─── AVALIAÇÃO ───────────────────────────────────────

  @Post('evaluation/cycles')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar ciclo de avaliação' })
  createEvalCycle(@Body() dto: CreateEvalCycleDto, @CurrentUser() user: CurrentUserData) {
    return this.service.createEvalCycle(dto, user.id);
  }

  @Post('evaluation/cycles/:cycleId/assign')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Atribuir avaliação' })
  assignEvaluation(
    @Param('cycleId') cycleId: string,
    @Body('userId', ParseIntPipe) userId: number,
    @Body('evaluatorId', ParseIntPipe) evaluatorId: number,
    @Body('type') type: MonitoringEvalType,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.assignEvaluation(
      cycleId,
      userId,
      evaluatorId,
      type || MonitoringEvalType.MANAGER,
      user.id,
    );
  }

  @Put('evaluation/:id/submit')
  @ApiOperation({ summary: 'Submeter avaliação' })
  submitEvaluation(
    @Param('id') id: string,
    @Body() dto: MonitoringSubmitEvaluationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.service.submitEvaluation(id, dto, user);
  }

  @Get('evaluation/my-evaluations')
  @ApiOperation({ summary: 'As minhas avaliações' })
  getMyEvaluations(@CurrentUser() user: CurrentUserData) {
    return this.service.getMyEvaluations(user.id);
  }

  @Get('evaluation/to-complete')
  @ApiOperation({ summary: 'Avaliações que tenho de completar' })
  getEvaluationsToComplete(@CurrentUser() user: CurrentUserData) {
    return this.service.getEvaluationsToComplete(user.id);
  }
}
