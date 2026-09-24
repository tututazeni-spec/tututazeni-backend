// src/competencies/competencies.controller.ts
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
import { CompetenciesService } from './competencies.service';
import {
  CreateCompetencyDto,
  UpdateCompetencyDto,
  CompetencyFilterDto,
  UpsertUserCompetencyDto,
  SelfAssessmentDto,
  ManagerAssessmentDto,
  MapCompetencyToPositionDto,
  MapCompetencyToCourseDto,
  CreateProficiencyLevelDto,
  UpdateProficiencyLevelDto,
  CreateEndorsementDto,
  CreateCompetencyModelDto,
  UpdateCompetencyModelDto,
  CompetencyModelFilterDto,
  UpsertCompetencyModelItemDto,
  SkillMatrixFilterDto,
  CompetencyEvaluationFilterDto,
} from './competencies.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Competencies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('competencies')
export class CompetenciesController {
  constructor(private readonly svc: CompetenciesService) {}

  // ── Catálogo ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Catálogo de competências com filtros' })
  findAll(@Query() filters: CompetencyFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('overview')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Visão Geral — painel de KPIs organizacionais de competências' })
  overview() {
    return this.svc.getOverview();
  }

  @Get('top')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Top competências da organização (mais frequentes)' })
  @ApiQuery({ name: 'limit', required: false })
  top(@Query('limit') limit?: string) {
    return this.svc.getTopCompetencies(limit ? parseInt(limit) : 10);
  }

  @Get('skill-matrix')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary:
      'Skill Matrix — grid utilizadores × competências (docs/módulo_competencies.md §5)',
  })
  skillMatrix(@Query() filters: SkillMatrixFilterDto) {
    return this.svc.getSkillMatrix(filters);
  }

  @Get('evaluations')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({
    summary: 'Avaliações de competências — lista consolidada (docs/módulo_competencies.md §6)',
  })
  evaluations(@Query() filters: CompetencyEvaluationFilterDto) {
    return this.svc.getEvaluations(filters);
  }

  @Get('dashboard/gaps')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Dashboard de gaps organizacionais' })
  @ApiQuery({ name: 'departmentId', required: false })
  orgGapDashboard(@Query('departmentId') departmentId?: string) {
    return this.svc.getOrgGapDashboard(departmentId ? parseInt(departmentId) : undefined);
  }

  // ── Níveis de Proficiência (rotas literais — antes de :id) ────────────────

  @Get('proficiency-levels')
  @ApiOperation({ summary: 'Listar níveis de proficiência (aba Níveis de Proficiência)' })
  @ApiQuery({ name: 'competencyId', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAllProficiencyLevels(
    @Query('competencyId') competencyId?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.findAllProficiencyLevels({
      competencyId: competencyId ? parseInt(competencyId) : undefined,
      search,
    });
  }

  // ── Modelos de Competências (rotas literais — antes de :id) ───────────────

  @Get('models')
  @ApiOperation({ summary: 'Listar modelos de competências' })
  findAllModels(@Query() filters: CompetencyModelFilterDto) {
    return this.svc.findAllModels(filters);
  }

  @Post('models')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar modelo de competências' })
  createModel(@Body() dto: CreateCompetencyModelDto) {
    return this.svc.createModel(dto);
  }

  @Get('models/:id')
  @ApiOperation({ summary: 'Detalhe de um modelo de competências' })
  findOneModel(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOneModel(id);
  }

  @Put('models/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar modelo de competências' })
  updateModel(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCompetencyModelDto) {
    return this.svc.updateModel(id, dto);
  }

  @Delete('models/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eliminar modelo de competências (só sem competências associadas)' })
  removeModel(@Param('id', ParseIntPipe) id: number) {
    return this.svc.removeModel(id);
  }

  @Post('models/:id/items')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Adicionar/actualizar competência num modelo' })
  upsertModelItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertCompetencyModelItemDto,
  ) {
    return this.svc.upsertModelItem(id, dto);
  }

  @Delete('models/:id/items/:competencyId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover competência de um modelo' })
  removeModelItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('competencyId', ParseIntPipe) competencyId: number,
  ) {
    return this.svc.removeModelItem(id, competencyId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe da competência (cursos, cargos, níveis)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  // ── Gestão (Admin/RH) ────────────────────────────────────────────────────

  @Post()
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar competência' })
  create(@Body() dto: CreateCompetencyDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar competência' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCompetencyDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/archive')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Arquivar competência (soft inactivate)' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.svc.archive(id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Eliminar competência (só sem utilizadores associados)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ── Níveis de Proficiência ────────────────────────────────────────────────

  @Post('proficiency-levels')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar nível de proficiência para uma competência' })
  createProficiencyLevel(@Body() dto: CreateProficiencyLevelDto) {
    return this.svc.createProficiencyLevel(dto);
  }

  @Patch('proficiency-levels/:levelId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar nível de proficiência' })
  updateProficiencyLevel(
    @Param('levelId', ParseIntPipe) levelId: number,
    @Body() dto: UpdateProficiencyLevelDto,
  ) {
    return this.svc.updateProficiencyLevel(levelId, dto);
  }

  @Delete('proficiency-levels/:levelId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover nível de proficiência' })
  removeProficiencyLevel(@Param('levelId', ParseIntPipe) levelId: number) {
    return this.svc.removeProficiencyLevel(levelId);
  }

  // ── Mapeamentos ───────────────────────────────────────────────────────────

  @Post('map/position')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Mapear competência a um cargo (com nível requerido)' })
  mapToPosition(@Body() dto: MapCompetencyToPositionDto) {
    return this.svc.mapToPosition(dto);
  }

  @Delete('map/position/:positionId/:competencyId')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Remover mapeamento cargo → competência' })
  unmapFromPosition(
    @Param('positionId', ParseIntPipe) positionId: number,
    @Param('competencyId', ParseIntPipe) competencyId: number,
  ) {
    return this.svc.unmapFromPosition(positionId, competencyId);
  }

  @Post('map/course')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Mapear competência a um curso' })
  mapToCourse(@Body() dto: MapCompetencyToCourseDto) {
    return this.svc.mapToCourse(dto);
  }

  // ── Utilizador — colaborador autenticado ──────────────────────────────────

  @Get('my/profile')
  @ApiOperation({ summary: 'O meu perfil de competências' })
  myCompetencies(@CurrentUser() user: CurrentUserData) {
    return this.svc.getUserCompetencies(user.id);
  }

  @Get('my/gap/:positionId')
  @ApiOperation({ summary: 'O meu gap para um cargo' })
  myGap(
    @CurrentUser() user: CurrentUserData,
    @Param('positionId', ParseIntPipe) positionId: number,
  ) {
    return this.svc.getCompetencyGap(user.id, positionId);
  }

  @Get('my/gap')
  @ApiOperation({ summary: 'O meu gap para o meu cargo actual (resolvido automaticamente)' })
  myGapAuto(@CurrentUser() user: CurrentUserData) {
    return this.svc.getCompetencyGapForUser(user.id);
  }

  @Get('my/recommendations')
  @ApiOperation({ summary: 'Recomendações baseadas nos meus gaps' })
  myRecommendations(@CurrentUser() user: CurrentUserData) {
    return this.svc.getRecommendations(user.id);
  }

  @Get('my/evolution')
  @ApiOperation({ summary: 'Histórico de evolução das minhas competências' })
  @ApiQuery({ name: 'competencyId', required: false })
  myEvolution(@CurrentUser() user: CurrentUserData, @Query('competencyId') competencyId?: string) {
    return this.svc.getCompetencyEvolution(
      user.id,
      competencyId ? parseInt(competencyId) : undefined,
    );
  }

  @Post('my/self-assess')
  @ApiOperation({ summary: 'Autoavaliação de competência' })
  @HttpCode(HttpStatus.OK)
  selfAssess(@CurrentUser() user: CurrentUserData, @Body() dto: SelfAssessmentDto) {
    return this.svc.selfAssess(user.id, dto);
  }

  @Get('my/endorsements')
  @ApiOperation({ summary: 'Os meus endorsements recebidos' })
  myEndorsements(@CurrentUser() user: CurrentUserData) {
    return this.svc.getEndorsements(user.id);
  }

  // ── Gestão de utilizadores (Admin/RH/Gestor) ──────────────────────────────

  @Get('user/:userId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Perfil de competências de um utilizador' })
  userCompetencies(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getUserCompetencies(userId);
  }

  @Get('user/:userId/gap/:positionId')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Gap analysis de um utilizador para um cargo' })
  gapAnalysis(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('positionId', ParseIntPipe) positionId: number,
  ) {
    return this.svc.getCompetencyGap(userId, positionId);
  }

  // Usada pela aba "Competências" do módulo Evaluation (docs/
  // modulo_evaluation.md pt.6) — resolve o cargo actual do colaborador em vez
  // de o exigir na URL, já que quem chama (gestor a rever a equipa) só tem o
  // userId à mão.
  @Get('user/:userId/gap')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR, Role.LIDER)
  @ApiOperation({ summary: 'Gap analysis de um utilizador para o seu cargo actual' })
  gapAnalysisAuto(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getCompetencyGapForUser(userId);
  }

  @Get('user/:userId/evolution')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Histórico de evolução de competências de um utilizador' })
  userEvolution(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('competencyId') competencyId?: string,
  ) {
    return this.svc.getCompetencyEvolution(
      userId,
      competencyId ? parseInt(competencyId) : undefined,
    );
  }

  @Get('user/:userId/endorsements')
  @ApiOperation({ summary: 'Endorsements de um utilizador' })
  userEndorsements(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getEndorsements(userId);
  }

  @Post('user/upsert')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Atribuir/actualizar competência de utilizador (Admin/RH/Gestor)' })
  upsertUser(@CurrentUser() updater: CurrentUserData, @Body() dto: UpsertUserCompetencyDto) {
    return this.svc.upsertUserCompetency(dto, updater.id);
  }

  @Post('user/manager-assess')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Avaliação de competência pelo gestor' })
  managerAssess(@CurrentUser() manager: CurrentUserData, @Body() dto: ManagerAssessmentDto) {
    return this.svc.managerAssess(manager.id, dto);
  }

  // ── Endorsements ──────────────────────────────────────────────────────────

  @Post('endorse')
  @ApiOperation({ summary: 'Endorsar competência de um colega' })
  endorse(@CurrentUser() user: CurrentUserData, @Body() dto: CreateEndorsementDto) {
    return this.svc.addEndorsement(user.id, dto);
  }
}
