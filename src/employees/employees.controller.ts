// ─── employees/employees.controller.ts ───────────────────────────────────────
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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  CreateContractDto,
  CreateEmployeeAttendanceDto,
  CreateFeedback360Dto,
  CreateEmployeeCareerPlanDto,
  CreatePdiDto,
  UpdatePdiProgressDto,
  EmployeesCreateDocumentDto,
  AssignSkillDto,
  UpdateSkillLevelDto,
  CreateTimelineEventDto,
  CreateSelfServiceRequestDto,
  ReviewRequestDto,
  BulkAssignCourseDto,
  BulkUpdateStatusDto,
  EmployeeFilterDto,
} from './employees.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// ─────────────────────────────────────────────────────────────────────────────

@ApiTags('Employees')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly svc: EmployeesService) {}

  // ══════════════════════════════════════════════════════════════════
  // CORE — LIST / DETAIL / CRUD
  // ══════════════════════════════════════════════════════════════════

  @Get()
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Listar colaboradores com filtros avançados' })
  @ApiResponse({ status: 200, description: 'Lista paginada de colaboradores' })
  findAll(@Query() filters: EmployeeFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('headcount')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Estatísticas de headcount (dashboard)' })
  getHeadcount() {
    return this.svc.getHeadcountStats();
  }

  @Get('export')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Exportar colaboradores (CSV/JSON)' })
  async exportAll(@Query() filters: EmployeeFilterDto) {
    const data = await this.svc.exportEmployees(filters);
    return { data, count: data.length };
  }

  @Get('org-chart')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'Organograma hierárquico' })
  @ApiQuery({ name: 'rootId', required: false, type: Number })
  getOrgChart(@Query('rootId') rootId?: string) {
    return this.svc.getOrgChart(rootId ? +rootId : undefined);
  }

  @Get(':id')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'Detalhe completo do colaborador' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.findOne(id, user?.id);
  }

  @Get(':id/stats')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'KPIs e estatísticas do colaborador' })
  getStats(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getEmployeeStats(id);
  }

  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar colaborador' })
  @ApiResponse({ status: 201, description: 'Colaborador criado com sucesso' })
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: any) {
    return this.svc.create(dto, user.id);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar dados do colaborador' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.update(id, dto, user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Desligar colaborador (soft delete → status TERMINATED)' })
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.remove(id, user.id);
  }

  // ══════════════════════════════════════════════════════════════════
  // CONTRACTS
  // ══════════════════════════════════════════════════════════════════

  @Get(':id/contracts')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Contratos do colaborador' })
  getContracts(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getContracts(id);
  }

  @Post('contracts')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar contrato' })
  createContract(@Body() dto: CreateContractDto) {
    return this.svc.createContract(dto);
  }

  @Patch('contracts/:id/status')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar status do contrato' })
  updateContractStatus(@Param('id', ParseIntPipe) id: number, @Body() body: { status: string }) {
    return this.svc.updateContractStatus(id, body.status);
  }

  // ══════════════════════════════════════════════════════════════════
  // ATTENDANCE
  // ══════════════════════════════════════════════════════════════════

  @Get(':id/attendance')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Histórico de presenças' })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  getAttendance(
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.getAttendance(id, from, to);
  }

  @Post('attendance')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Registar presença' })
  logAttendance(@Body() dto: CreateEmployeeAttendanceDto) {
    return this.svc.logAttendance(dto);
  }

  // ══════════════════════════════════════════════════════════════════
  // FEEDBACK 360
  // ══════════════════════════════════════════════════════════════════

  @Get(':id/feedback360')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'Histórico de Feedback 360 com média e agrupamento por ciclo' })
  @ApiQuery({ name: 'cycle', required: false })
  getFeedback360(@Param('id', ParseIntPipe) id: number, @Query('cycle') cycle?: string) {
    return this.svc.getFeedback360(id, cycle);
  }

  @Post('feedback360')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Adicionar Feedback 360' })
  addFeedback(@Body() dto: CreateFeedback360Dto) {
    return this.svc.addFeedback360(dto);
  }

  // ══════════════════════════════════════════════════════════════════
  // CAREER PLANS
  // ══════════════════════════════════════════════════════════════════

  @Get(':id/career-plans')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'Planos de carreira' })
  getCareerPlans(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getCareerPlans(id);
  }

  @Post('career-plans')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar plano de carreira' })
  createCareerPlan(@Body() dto: CreateEmployeeCareerPlanDto) {
    return this.svc.createCareerPlan(dto);
  }

  @Patch('career-plans/:id/status')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar status do plano de carreira' })
  updateCareerPlanStatus(@Param('id', ParseIntPipe) id: number, @Body() body: { status: string }) {
    return this.svc.updateCareerPlanStatus(id, body.status);
  }

  // ══════════════════════════════════════════════════════════════════
  // PDI
  // ══════════════════════════════════════════════════════════════════

  @Get(':id/pdis')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'PDIs do colaborador' })
  getPdis(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getPdis(id);
  }

  @Post('pdis')
  @Roles('ADMIN', 'RH', 'LIDER')
  @ApiOperation({ summary: 'Criar PDI' })
  createPdi(@Body() dto: CreatePdiDto, @CurrentUser() user: any) {
    return this.svc.createPdi(dto, user.id);
  }

  @Patch('pdis/:id/progress')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'Atualizar progresso do PDI' })
  updatePdiProgress(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePdiProgressDto) {
    return this.svc.updatePdiProgress(id, dto);
  }

  // ══════════════════════════════════════════════════════════════════
  // SKILLS / COMPETÊNCIAS
  // ══════════════════════════════════════════════════════════════════

  @Get(':id/skills')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'Skills e competências com gap analysis' })
  getSkills(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getEmployeeSkills(id);
  }

  @Post(':id/skills')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'Atribuir skill ao colaborador' })
  assignSkill(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignSkillDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.assignSkill({ ...dto, employeeId: id }, user.id);
  }

  @Patch(':id/skills/:skillId')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'Atualizar nível da skill' })
  updateSkillLevel(
    @Param('id', ParseIntPipe) id: number,
    @Param('skillId', ParseIntPipe) skillId: number,
    @Body() dto: UpdateSkillLevelDto,
  ) {
    return this.svc.updateSkillLevel(id, skillId, dto);
  }

  @Delete(':id/skills/:skillId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover skill do colaborador' })
  removeSkill(
    @Param('id', ParseIntPipe) id: number,
    @Param('skillId', ParseIntPipe) skillId: number,
  ) {
    return this.svc.removeSkill(id, skillId);
  }

  // ══════════════════════════════════════════════════════════════════
  // DOCUMENTS
  // ══════════════════════════════════════════════════════════════════

  @Get(':id/documents')
  @Roles('ADMIN', 'RH', 'COLABORADOR')
  @ApiOperation({ summary: 'Documentos do colaborador (com alertas de vencimento)' })
  getDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getDocuments(id);
  }

  @Post(':id/documents')
  @Roles('ADMIN', 'RH', 'COLABORADOR')
  @ApiOperation({ summary: 'Adicionar documento' })
  createDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EmployeesCreateDocumentDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.createDocument({ ...dto, employeeId: id }, user.id);
  }

  @Delete('documents/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover documento (soft delete)' })
  deleteDocument(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.deleteDocument(id, user.id);
  }

  // ══════════════════════════════════════════════════════════════════
  // TIMELINE
  // ══════════════════════════════════════════════════════════════════

  @Get(':id/timeline')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'Timeline de eventos do colaborador' })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getTimeline(
    @Param('id', ParseIntPipe) id: number,
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getTimeline(id, type, limit ? +limit : 50);
  }

  @Post(':id/timeline')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Adicionar evento manual à timeline' })
  addTimelineEvent(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateTimelineEventDto) {
    return this.svc.addTimelineEvent({ ...dto, employeeId: id });
  }

  // ══════════════════════════════════════════════════════════════════
  // SELF-SERVICE REQUESTS
  // ══════════════════════════════════════════════════════════════════

  @Get(':id/requests')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'Solicitações de autoatendimento' })
  @ApiQuery({ name: 'status', required: false })
  getRequests(@Param('id', ParseIntPipe) id: number, @Query('status') status?: string) {
    return this.svc.getRequests(id, status);
  }

  @Post(':id/requests')
  @Roles('ADMIN', 'RH', 'LIDER', 'COLABORADOR')
  @ApiOperation({ summary: 'Criar solicitação de autoatendimento' })
  createRequest(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateSelfServiceRequestDto) {
    return this.svc.createRequest({ ...dto, employeeId: id });
  }

  @Patch('requests/:id/review')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Aprovar ou rejeitar solicitação' })
  reviewRequest(@Param('id', ParseIntPipe) id: number, @Body() dto: ReviewRequestDto) {
    return this.svc.reviewRequest(id, dto);
  }

  // ══════════════════════════════════════════════════════════════════
  // BULK ACTIONS
  // ══════════════════════════════════════════════════════════════════

  @Post('bulk/courses')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atribuir cursos em massa' })
  bulkAssignCourses(@Body() dto: BulkAssignCourseDto, @CurrentUser() user: any) {
    return this.svc.bulkAssignCourses(dto, user.id);
  }

  @Patch('bulk/status')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atualizar status de múltiplos colaboradores' })
  bulkUpdateStatus(@Body() dto: BulkUpdateStatusDto, @CurrentUser() user: any) {
    return this.svc.bulkUpdateStatus(dto, user.id);
  }

  // ══════════════════════════════════════════════════════════════════
  // AUDIT LOG
  // ══════════════════════════════════════════════════════════════════

  @Get(':id/audit-log')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Log de auditoria do perfil do colaborador' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getAuditLog(@Param('id', ParseIntPipe) id: number, @Query('limit') limit?: string) {
    return this.svc.getAuditLog(id, limit ? +limit : 50);
  }
}
