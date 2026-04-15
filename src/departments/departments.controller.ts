import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import {
  DepartmentsService, UnitsService, RolesService,
  PositionsService, CareersService,
} from './departments.service';
import {
  CreateDepartmentDto, UpdateDepartmentDto, DepartmentFilterDto,
  TransferMemberDto, BulkTransferDto,
  CreateUnitDto, UpdateUnitDto,
  CreateDeptRoleDto, UpdateDeptRoleDto, CreatePermissionDto,
  CreatePositionDto, UpdatePositionDto,
  CreateCareerPositionDto,
} from './departments.dto';

// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────

@ApiTags('Departments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly svc: DepartmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar departamentos (com filtros e paginação)' })
  findAll(@Query() filters: DepartmentFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Árvore hierárquica completa (Org Chart)' })
  getTree() {
    return this.svc.getTree();
  }

  @Get('dashboard/comparative')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Dashboard comparativo de departamentos' })
  comparativeDashboard() {
    return this.svc.getComparativeDashboard();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do departamento (membros, sub-deptos, histórico)' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get(':id/metrics')
  @ApiOperation({ summary: 'Métricas do departamento' })
  metrics(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getMetrics(id);
  }

  @Get(':id/transfer-history')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Histórico de transferências do departamento' })
  @ApiQuery({ name: 'page', required: false })
  transferHistory(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
  ) {
    return this.svc.getTransferHistory(id, page ? parseInt(page) : 1);
  }

  @Post()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar departamento' })
  create(@Body() dto: CreateDepartmentDto) {
    return this.svc.create(dto);
  }

  @Put(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar departamento' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDepartmentDto) {
    return this.svc.update(id, dto);
  }

  @Patch(':id/deactivate')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Desactivar departamento (soft — preserva histórico)' })
  @HttpCode(HttpStatus.OK)
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deactivate(id);
  }

  @Patch(':id/activate')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Reactivar departamento' })
  @HttpCode(HttpStatus.OK)
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.activate(id);
  }

  @Post('members/transfer')
  @Roles('ADMIN', 'RH', 'GESTOR')
  @ApiOperation({ summary: 'Transferir colaborador entre departamentos' })
  transferMember(@Body() dto: TransferMemberDto) {
    return this.svc.transferMember(dto);
  }

  @Post('members/bulk-transfer')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Transferência em massa de colaboradores' })
  bulkTransfer(@Body() dto: BulkTransferDto) {
    return this.svc.bulkTransfer(dto);
  }
}

// ─── UNITS ────────────────────────────────────────────────────────────────────

@ApiTags('Units')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('units')
export class UnitsController {
  constructor(private readonly svc: UnitsService) {}

  @Get()    @ApiOperation({ summary: 'Listar unidades' })
  findAll() { return this.svc.findAll(); }

  @Get(':id') @ApiOperation({ summary: 'Detalhe da unidade' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post() @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Criar unidade' })
  create(@Body() dto: CreateUnitDto) { return this.svc.create(dto); }

  @Put(':id') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Actualizar unidade' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUnitDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id') @Roles('ADMIN') @ApiOperation({ summary: 'Remover unidade' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}

// ─── ROLES ────────────────────────────────────────────────────────────────────

@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly svc: RolesService) {}

  @Get()    @ApiOperation({ summary: 'Listar roles com permissões' })
  findAll() { return this.svc.findAll(); }

  @Get(':id') @ApiOperation({ summary: 'Detalhe da role' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post() @Roles('ADMIN') @ApiOperation({ summary: 'Criar role' })
  create(@Body() dto: CreateDeptRoleDto) { return this.svc.create(dto); }

  @Post('init-defaults') @Roles('ADMIN') @ApiOperation({ summary: 'Inicializar roles padrão' })
  initDefaults() { return this.svc.initDefaultRoles(); }

  @Post('permissions') @Roles('ADMIN') @ApiOperation({ summary: 'Criar permissão' })
  addPermission(@Body() dto: CreatePermissionDto) { return this.svc.addPermission(dto); }

  @Post(':id/permissions/:permissionId/assign') @Roles('ADMIN')
  @ApiOperation({ summary: 'Atribuir permissão a role' })
  assignPermission(
    @Param('id', ParseIntPipe) roleId: number,
    @Param('permissionId', ParseIntPipe) permissionId: number,
  ) { return this.svc.assignPermissionToRole(roleId, permissionId); }

  @Delete(':id/permissions/:permissionId') @Roles('ADMIN')
  @ApiOperation({ summary: 'Revogar permissão de role' })
  revokePermission(
    @Param('id', ParseIntPipe) roleId: number,
    @Param('permissionId', ParseIntPipe) permissionId: number,
  ) { return this.svc.revokePermissionFromRole(roleId, permissionId); }

  @Put(':id') @Roles('ADMIN') @ApiOperation({ summary: 'Actualizar role' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDeptRoleDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id') @Roles('ADMIN') @ApiOperation({ summary: 'Remover role' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }

  @Delete('permissions/:permissionId') @Roles('ADMIN')
  @ApiOperation({ summary: 'Remover permissão global' })
  removePermission(@Param('permissionId', ParseIntPipe) id: number) {
    return this.svc.removePermission(id);
  }
}

// ─── POSITIONS ────────────────────────────────────────────────────────────────

@ApiTags('Positions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('positions')
export class PositionsController {
  constructor(private readonly svc: PositionsService) {}

  @Get()    @ApiOperation({ summary: 'Listar posições' })
  findAll() { return this.svc.findAll(); }

  @Get(':id') @ApiOperation({ summary: 'Detalhe da posição' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post() @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Criar posição' })
  create(@Body() dto: CreatePositionDto) { return this.svc.create(dto); }

  @Put(':id') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Actualizar posição' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePositionDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id') @Roles('ADMIN') @ApiOperation({ summary: 'Remover posição' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}

// ─── CAREERS ──────────────────────────────────────────────────────────────────

@ApiTags('Careers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('careers')
export class CareersController {
  constructor(private readonly svc: CareersService) {}

  @Get('ladder')    @ApiOperation({ summary: 'Escada de carreira completa' })
  ladder() { return this.svc.getCareerLadder(); }

  @Get('positions') @ApiOperation({ summary: 'Listar posições de carreira' })
  positions() { return this.svc.findAllPositions(); }

  @Get('positions/:id') @ApiOperation({ summary: 'Detalhe da posição de carreira' })
  position(@Param('id', ParseIntPipe) id: number) { return this.svc.findOnePosition(id); }

  @Get('my') @ApiOperation({ summary: 'Meu histórico de carreira' })
  myHistory(@CurrentUser() user: any) { return this.svc.getUserCareerHistory(user.id); }

  @Get('users/:userId') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Histórico de carreira de um colaborador' })
  userHistory(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getUserCareerHistory(userId);
  }

  @Post('positions') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Criar posição de carreira' })
  createPosition(@Body() dto: CreateCareerPositionDto) { return this.svc.createPosition(dto); }

  @Post('users/:userId/assign/:positionId') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atribuir posição de carreira' })
  assign(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('positionId', ParseIntPipe) positionId: number,
  ) { return this.svc.assignCareerPosition(userId, positionId); }
}
