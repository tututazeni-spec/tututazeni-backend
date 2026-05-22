// src/succession/succession.controller.ts
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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SuccessionService } from './succession.service';
import {
  CreateCriticalPositionDto,
  UpdateCriticalPositionDto,
  CreateSuccessionPlanDto,
  UpdateSuccessionPlanDto,
  AddToTalentPoolDto,
  GeneratePDIDto,
  SuccessionFilterDto,
  CriticalPositionFilterDto,
} from './succession.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';

@ApiTags('Succession Planning')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('succession')
export class SuccessionController {
  constructor(private readonly svc: SuccessionService) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Dashboard executivo de sucessão (KPIs, alertas críticos)' })
  dashboard() {
    return this.svc.getDashboard();
  }

  // ── Cargos críticos ───────────────────────────────────────────────────────

  @Get('critical-positions')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar cargos críticos com filtros e indicadores' })
  getCriticalPositions(@Query() filters: CriticalPositionFilterDto) {
    return this.svc.getCriticalPositions(filters);
  }

  @Get('critical-positions/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Detalhe do cargo crítico (titular + plano de sucessores)' })
  getCriticalPosition(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOneCriticalPosition(id);
  }

  @Post('critical-positions')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Classificar cargo como crítico' })
  createCriticalPosition(@Body() dto: CreateCriticalPositionDto) {
    return this.svc.createCriticalPosition(dto);
  }

  @Patch('critical-positions/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar cargo crítico' })
  @HttpCode(HttpStatus.OK)
  updateCriticalPosition(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCriticalPositionDto,
  ) {
    return this.svc.updateCriticalPosition(id, dto);
  }

  // ── Planos de sucessão ────────────────────────────────────────────────────

  @Get()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar planos de sucessão' })
  findAll(@Query() filters: SuccessionFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('org-chart')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Organograma de sucessão (mapa visual de cargos e sucessores)' })
  @ApiQuery({ name: 'departmentId', required: false })
  orgChart(@Query('departmentId') departmentId?: string) {
    return this.svc.getOrganizationChart(departmentId ? parseInt(departmentId) : undefined);
  }

  @Get('position/:positionId/summary')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Succession Chair View — titulares e pipeline por cargo' })
  positionSummary(@Param('positionId', ParseIntPipe) id: number) {
    return this.svc.getPositionSummary(id);
  }

  @Get('compare')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Comparar dois candidatos para um cargo crítico' })
  @ApiQuery({ name: 'candidateA', required: true })
  @ApiQuery({ name: 'candidateB', required: true })
  @ApiQuery({ name: 'criticalPositionId', required: true })
  compareProfiles(
    @Query('candidateA') candidateA: string,
    @Query('candidateB') candidateB: string,
    @Query('criticalPositionId') criticalPositionId: string,
  ) {
    return this.svc.compareProfiles(
      parseInt(candidateA),
      parseInt(candidateB),
      parseInt(criticalPositionId),
    );
  }

  @Get(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Detalhe do plano de sucessão com match score e gaps' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar plano de sucessão (match score calculado automaticamente)' })
  create(@Body() dto: CreateSuccessionPlanDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar plano de sucessão' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSuccessionPlanDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover plano de sucessão' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ── Talent Pool ───────────────────────────────────────────────────────────

  @Get('talent-pool/all')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Talent Pool — colaboradores de alto potencial' })
  getTalentPool() {
    return this.svc.getTalentPool();
  }

  @Post('talent-pool')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Adicionar colaborador ao Talent Pool' })
  addToTalentPool(@Body() dto: AddToTalentPoolDto) {
    return this.svc.addToTalentPool(dto);
  }

  @Delete('talent-pool/:userId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover colaborador do Talent Pool' })
  removeFromTalentPool(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.removeFromTalentPool(userId);
  }

  // ── PDI ───────────────────────────────────────────────────────────────────

  @Post('pdi/generate')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Gerar PDI automático baseado nos gaps do plano de sucessão' })
  generatePDI(@Body() dto: GeneratePDIDto) {
    return this.svc.generatePDI(dto);
  }
}
