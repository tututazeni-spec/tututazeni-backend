// ─── src/competency-map/competency-map.controller.ts ─────────────────────────
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { CompetencyMapService } from './competency-map.service';
import {
  SkillFilterDto, GapAnalysisFilterDto,
  CreateSkillCategoryDto, CreateSkillMapDto, UpdateSkillDto,
  CreateSkillProficiencyLevelDto,
  SetRoleSkillMatrixDto,
  UpsertEmployeeSkillDto, BatchAssessmentDto,
} from './competency-map.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Competency Map')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('competency-map')
export class CompetencyMapController {
  constructor(private readonly svc: CompetencyMapService) {}
 
  // ── Heatmap & Analytics ───────────────────────────────────────────
 
  @Get('heatmap')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Dados de heatmap de competências (todos os colaboradores × skills)' })
  @ApiQuery({ name: 'department', required: false })
  getHeatmap(@Query('department') department?: string) {
    return this.svc.getHeatmapData(department);
  }
 
  @Get('organisational-gap')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Gap analysis organizacional — skills críticas, distribuição por dept.' })
  getOrganisationalGap(@Query() filters: GapAnalysisFilterDto) {
    return this.svc.getOrganisationalGapAnalysis(filters);
  }
 
  // ── Skill Categories ──────────────────────────────────────────────
 
  @Get('categories')
  @ApiOperation({ summary: 'Listar categorias de skills (com contagem)' })
  getCategories() { return this.svc.getCategories(); }
 
  @Post('categories')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar categoria (família → domínio → competência)' })
  createCategory(@Body() dto: CreateSkillCategoryDto) { return this.svc.createCategory(dto); }
 
  // ── Skills Catalogue ──────────────────────────────────────────────
 
  @Get('skills')
  @ApiOperation({ summary: 'Catálogo de skills com filtros' })
  getSkills(@Query() filters: SkillFilterDto) { return this.svc.getSkills(filters); }
 
  @Get('skills/:id')
  @ApiOperation({ summary: 'Detalhe da skill com níveis de proficiência e uso' })
  getSkill(@Param('id', ParseIntPipe) id: number) { return this.svc.getSkill(id); }
 
  @Post('skills')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar skill/competência' })
  createSkill(@Body() dto: CreateSkillMapDto, @CurrentUser() user: any) {
    return this.svc.createSkill(dto, user.id);
  }
 
  @Patch('skills/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar skill' })
  updateSkill(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateSkillDto) {
    return this.svc.updateSkill(id, dto);
  }
 
  // ── Proficiency Levels ────────────────────────────────────────────
 
  @Get('skills/:id/levels')
  @ApiOperation({ summary: 'Níveis de proficiência de uma skill' })
  getProficiencyLevels(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getProficiencyLevels(id);
  }
 
  @Post('skills/proficiency-levels')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Definir nível de proficiência (nome, comportamento observável)' })
  setProficiencyLevel(@Body() dto: CreateSkillProficiencyLevelDto) {
    return this.svc.setProficiencyLevels(dto);
  }
 
  // ── Role Skill Matrix ─────────────────────────────────────────────
 
  @Get('role-matrix')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar todas as matrizes de skills por cargo' })
  @ApiQuery({ name: 'department', required: false })
  getAllRoleMatrices(@Query('department') department?: string) {
    return this.svc.getAllRoleMatrices(department);
  }
 
  @Get('role-matrix/:roleCode')
  @ApiOperation({ summary: 'Matriz de skills de um cargo específico' })
  getRoleMatrix(@Param('roleCode') roleCode: string) {
    return this.svc.getRoleSkillMatrix(roleCode);
  }
 
  @Post('role-matrix')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Definir / substituir matriz de skills de um cargo' })
  setRoleMatrix(@Body() dto: SetRoleSkillMatrixDto) {
    return this.svc.setRoleSkillMatrix(dto);
  }
 
  // ── My Map ────────────────────────────────────────────────────────
 
  @Get('my')
  @ApiOperation({ summary: 'Meu mapa de competências (skills + gap analysis + recomendações)' })
  myMap(@CurrentUser() user: any) { return this.svc.getMap(user.id); }
 
  @Get('my/radar')
  @ApiOperation({ summary: 'Dados de radar chart do colaborador actual' })
  myRadar(@CurrentUser() user: any) { return this.svc.getRadarData(user.id); }
 
  @Get('my/gap')
  @ApiOperation({ summary: 'Gap analysis pessoal (vs cargo actual ou especificado)' })
  @ApiQuery({ name: 'roleCode', required: false })
  myGap(@CurrentUser() user: any, @Query('roleCode') roleCode?: string) {
    return this.svc.getUserGapAnalysis(user.id, roleCode);
  }
 
  @Get('my/history/:skillId')
  @ApiOperation({ summary: 'Histórico de evolução de uma skill' })
  mySkillHistory(@CurrentUser() user: any, @Param('skillId', ParseIntPipe) skillId: number) {
    return this.svc.getSkillHistory(user.id, skillId);
  }
 
  // ── User Map (Admin / Gestor) ─────────────────────────────────────
 
  @Get('user/:userId')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Mapa de competências de um colaborador' })
  userMap(@Param('userId', ParseIntPipe) id: number) { return this.svc.getMap(id); }
 
  @Get('user/:userId/gap')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Gap analysis de um colaborador' })
  @ApiQuery({ name: 'roleCode', required: false })
  userGap(
    @Param('userId', ParseIntPipe) id: number,
    @Query('roleCode') roleCode?: string,
  ) { return this.svc.getUserGapAnalysis(id, roleCode); }
 
  @Get('user/:userId/radar')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Dados de radar chart de um colaborador' })
  userRadar(@Param('userId', ParseIntPipe) id: number) { return this.svc.getRadarData(id); }
 
  // ── Department & Team Maps ────────────────────────────────────────
 
  @Get('department/:dept')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Mapa de competências de um departamento (top/bottom skills)' })
  deptMap(@Param('dept') dept: string) { return this.svc.getDepartmentMap(dept); }
 
  @Get('team')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Mapa da equipa do gestor actual (readiness + top gaps por pessoa)' })
  teamMap(@CurrentUser() user: any) { return this.svc.getTeamMap(user.id); }
 
  // ── Assessments ───────────────────────────────────────────────────
 
  @Post('assess')
  @ApiOperation({ summary: 'Registar avaliação de skill (autoavaliação, gestor, 360°, etc.)' })
  assess(@Body() dto: UpsertEmployeeSkillDto, @CurrentUser() user: any) {
    return this.svc.upsertEmployeeSkill(dto, user.id);
  }
 
  @Post('assess/batch')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Avaliação em lote (múltiplas skills de um colaborador)' })
  batchAssess(@Body() dto: BatchAssessmentDto, @CurrentUser() user: any) {
    return this.svc.batchAssessment(dto, user.id);
  }
}
