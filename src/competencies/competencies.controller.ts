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
  CreateEndorsementDto,
} from './competencies.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
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

  @Get('top')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Top competências da organização (mais frequentes)' })
  @ApiQuery({ name: 'limit', required: false })
  top(@Query('limit') limit?: string) {
    return this.svc.getTopCompetencies(limit ? parseInt(limit) : 10);
  }

  @Get('skill-matrix')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Skill Matrix — grid utilizadores × competências' })
  @ApiQuery({ name: 'departmentId', required: false })
  @ApiQuery({ name: 'positionId', required: false })
  skillMatrix(
    @Query('departmentId') departmentId?: string,
    @Query('positionId') positionId?: string,
  ) {
    return this.svc.getSkillMatrix(
      departmentId ? parseInt(departmentId) : undefined,
      positionId ? parseInt(positionId) : undefined,
    );
  }

  @Get('dashboard/gaps')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Dashboard de gaps organizacionais' })
  @ApiQuery({ name: 'departmentId', required: false })
  orgGapDashboard(@Query('departmentId') departmentId?: string) {
    return this.svc.getOrgGapDashboard(departmentId ? parseInt(departmentId) : undefined);
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
  myCompetencies(@CurrentUser() user: any) {
    return this.svc.getUserCompetencies(user.id);
  }

  @Get('my/gap/:positionId')
  @ApiOperation({ summary: 'O meu gap para um cargo' })
  myGap(@CurrentUser() user: any, @Param('positionId', ParseIntPipe) positionId: number) {
    return this.svc.getCompetencyGap(user.id, positionId);
  }

  @Get('my/recommendations')
  @ApiOperation({ summary: 'Recomendações baseadas nos meus gaps' })
  myRecommendations(@CurrentUser() user: any) {
    return this.svc.getRecommendations(user.id);
  }

  @Get('my/evolution')
  @ApiOperation({ summary: 'Histórico de evolução das minhas competências' })
  @ApiQuery({ name: 'competencyId', required: false })
  myEvolution(@CurrentUser() user: any, @Query('competencyId') competencyId?: string) {
    return this.svc.getCompetencyEvolution(
      user.id,
      competencyId ? parseInt(competencyId) : undefined,
    );
  }

  @Post('my/self-assess')
  @ApiOperation({ summary: 'Autoavaliação de competência' })
  @HttpCode(HttpStatus.OK)
  selfAssess(@CurrentUser() user: any, @Body() dto: SelfAssessmentDto) {
    return this.svc.selfAssess(user.id, dto);
  }

  @Get('my/endorsements')
  @ApiOperation({ summary: 'Os meus endorsements recebidos' })
  myEndorsements(@CurrentUser() user: any) {
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
  upsertUser(@CurrentUser() updater: any, @Body() dto: UpsertUserCompetencyDto) {
    return this.svc.upsertUserCompetency(dto, updater.id);
  }

  @Post('user/manager-assess')
  @Roles(Role.ADMIN, Role.RH, Role.GESTOR)
  @ApiOperation({ summary: 'Avaliação de competência pelo gestor' })
  managerAssess(@CurrentUser() manager: any, @Body() dto: ManagerAssessmentDto) {
    return this.svc.managerAssess(manager.id, dto);
  }

  // ── Endorsements ──────────────────────────────────────────────────────────

  @Post('endorse')
  @ApiOperation({ summary: 'Endorsar competência de um colega' })
  endorse(@CurrentUser() user: any, @Body() dto: CreateEndorsementDto) {
    return this.svc.addEndorsement(user.id, dto);
  }
}
