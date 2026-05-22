import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrganizationService } from './organization.service';
import {
  CreateOrgDepartmentDto,
  UpdateOrgDepartmentDto,
  DepartmentFilterDto,
  CreateOrgPositionDto,
  UpdateOrgPositionDto,
  PositionFilterDto,
  CreateOrgUnitDto,
  UpdateOrgUnitDto,
  RecordOrgChangeDto,
  OrgChartFilterDto,
} from './organization.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('Organization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organization')
export class OrganizationController {
  constructor(private readonly svc: OrganizationService) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('stats')
  @ApiOperation({
    summary: 'KPIs organizacionais (headcount, span of control, profundidade hierárquica)',
  })
  stats() {
    return this.svc.getStats();
  }

  @Get('headcount')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Headcount por departamento (ocupado vs planeado)' })
  headcount() {
    return this.svc.getHeadcountByDepartment();
  }

  @Get('span-of-control')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Relatório de span of control por gestor' })
  spanOfControl() {
    return this.svc.getSpanOfControlReport();
  }

  // ── Organograma ───────────────────────────────────────────────────────────

  @Get('chart')
  @ApiOperation({ summary: 'Organograma hierárquico (tree, até N níveis de profundidade)' })
  chart(@Query() filters: OrgChartFilterDto) {
    return this.svc.getOrgChart(filters);
  }

  // ── Timeline / Histórico ──────────────────────────────────────────────────

  @Get('timeline')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Timeline de movimentações organizacionais' })
  @ApiQuery({ name: 'fromDate', required: false })
  @ApiQuery({ name: 'toDate', required: false })
  timeline(@Query('fromDate') fromDate?: string, @Query('toDate') toDate?: string) {
    return this.svc.getOrgTimeline(fromDate, toDate);
  }

  @Post('changes')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Registar mudança organizacional (promoção, transferência, etc.)' })
  recordChange(@CurrentUser() user: any, @Body() dto: RecordOrgChangeDto) {
    return this.svc.recordOrgChange(dto, user.id);
  }

  @Get('users/:userId/history')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Histórico organizacional de um colaborador' })
  userHistory(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getUserOrgHistory(userId);
  }

  @Get('users/:userId/profile')
  @ApiOperation({ summary: 'Perfil organizacional completo de um colaborador' })
  userOrgProfile(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getUserOrgProfile(userId);
  }

  // ── Departamentos ─────────────────────────────────────────────────────────

  @Get('departments')
  @ApiOperation({ summary: 'Listar departamentos com filtros e paginação' })
  getDepartments(@Query() filters: DepartmentFilterDto) {
    return this.svc.getDepartments(filters);
  }

  @Get('departments/:id')
  @ApiOperation({ summary: 'Detalhe do departamento (colaboradores, sub-departamentos)' })
  getDepartment(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getDepartmentDetails(id);
  }

  @Post('departments')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar departamento' })
  createDepartment(@Body() dto: CreateOrgDepartmentDto) {
    return this.svc.createDepartment(dto);
  }

  @Put('departments/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar departamento' })
  updateDepartment(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrgDepartmentDto) {
    return this.svc.updateDepartment(id, dto);
  }

  @Delete('departments/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Eliminar departamento (apenas sem colaboradores)' })
  deleteDepartment(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteDepartment(id);
  }

  // ── Posições ──────────────────────────────────────────────────────────────

  @Get('positions')
  @ApiOperation({ summary: 'Listar posições/cargos com headcount' })
  getPositions(@Query() filters: PositionFilterDto) {
    return this.svc.getPositions(filters);
  }

  @Post('positions')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar posição/cargo' })
  createPosition(@Body() dto: CreateOrgPositionDto) {
    return this.svc.createPosition(dto);
  }

  @Put('positions/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar posição/cargo' })
  updatePosition(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrgPositionDto) {
    return this.svc.updatePosition(id, dto);
  }

  @Delete('positions/:id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Eliminar posição (apenas sem colaboradores)' })
  deletePosition(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deletePosition(id);
  }

  // ── Unidades ──────────────────────────────────────────────────────────────

  @Get('units')
  @ApiOperation({ summary: 'Listar unidades/escritórios' })
  getUnits() {
    return this.svc.getUnits();
  }

  @Post('units')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar unidade/filial' })
  createUnit(@Body() dto: CreateOrgUnitDto) {
    return this.svc.createUnit(dto);
  }

  @Put('units/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar unidade' })
  updateUnit(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrgUnitDto) {
    return this.svc.updateUnit(id, dto);
  }
}
