import {
  Controller, Get, Post, Put, Delete, Patch,
  Body, Param, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  DepartmentsService, UnitsService, RolesService,
  PositionsService, CareersService,
  CreateDepartmentDto, CreateUnitDto, CreateRoleDto,
  CreatePermissionDto, CreatePositionDto,
} from './departments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
// ─── DEPARTMENTS ──────────────────────────────────────────────────────────────
@ApiTags('Departments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('departments')
export class DepartmentsController {
  constructor(private readonly svc: DepartmentsService) {}
 
  @Get() @ApiOperation({ summary: 'Listar departamentos' })
  findAll() { return this.svc.findAll(); }
 
  @Get(':id') @ApiOperation({ summary: 'Detalhe do departamento' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post() @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Criar departamento' })
  create(@Body() dto: CreateDepartmentDto) { return this.svc.create(dto); }
 
  @Put(':id') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Atualizar departamento' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateDepartmentDto>) {
    return this.svc.update(id, dto);
  }
 
  @Delete(':id') @Roles('ADMIN') @ApiOperation({ summary: 'Remover departamento' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 
// ─── UNITS ────────────────────────────────────────────────────────────────────
@ApiTags('Units')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('units')
export class UnitsController {
  constructor(private readonly svc: UnitsService) {}
 
  @Get() @ApiOperation({ summary: 'Listar unidades' })
  findAll() { return this.svc.findAll(); }
 
  @Get(':id') @ApiOperation({ summary: 'Detalhe da unidade' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post() @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Criar unidade' })
  create(@Body() dto: CreateUnitDto) { return this.svc.create(dto); }
 
  @Put(':id') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Atualizar unidade' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateUnitDto>) {
    return this.svc.update(id, dto);
  }
 
  @Delete(':id') @Roles('ADMIN') @ApiOperation({ summary: 'Remover unidade' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 
// ─── ROLES & PERMISSIONS ──────────────────────────────────────────────────────
@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly svc: RolesService) {}
 
  @Get() @ApiOperation({ summary: 'Listar roles' })
  findAll() { return this.svc.findAll(); }
 
  @Get(':id') @ApiOperation({ summary: 'Detalhe da role' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post() @Roles('ADMIN') @ApiOperation({ summary: 'Criar role' })
  create(@Body() dto: CreateRoleDto) { return this.svc.create(dto); }
 
  @Post('init-defaults') @Roles('ADMIN') @ApiOperation({ summary: 'Inicializar roles padrão' })
  initDefaults() { return this.svc.initDefaultRoles(); }
 
  @Post(':id/permissions') @Roles('ADMIN') @ApiOperation({ summary: 'Adicionar permissão' })
  addPermission(@Body() dto: CreatePermissionDto) { return this.svc.addPermission(dto); }
 
  @Post(':id/permissions/:permissionId/assign') @Roles('ADMIN')
  @ApiOperation({ summary: 'Atribuir permissão a role' })
  assignPermission(
    @Param('id', ParseIntPipe) id: number,
    @Param('permissionId', ParseIntPipe) permissionId: number,
  ) { return this.svc.assignPermissionToRole(id, permissionId); }
 
  @Put(':id') @Roles('ADMIN') @ApiOperation({ summary: 'Atualizar role' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateRoleDto>) {
    return this.svc.update(id, dto);
  }
 
  @Delete(':id') @Roles('ADMIN') @ApiOperation({ summary: 'Remover role' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
 
  @Delete('permissions/:permissionId') @Roles('ADMIN')
  @ApiOperation({ summary: 'Remover permissão' })
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
 
  @Get() @ApiOperation({ summary: 'Listar posições' })
  findAll() { return this.svc.findAll(); }
 
  @Get(':id') @ApiOperation({ summary: 'Detalhe da posição' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post() @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Criar posição' })
  create(@Body() dto: CreatePositionDto) { return this.svc.create(dto); }
 
  @Put(':id') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Atualizar posição' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreatePositionDto>) {
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
 
  @Get('ladder') @ApiOperation({ summary: 'Escada de carreira' })
  ladder() { return this.svc.getCareerLadder(); }
 
  @Get('positions') @ApiOperation({ summary: 'Listar posições de carreira' })
  positions() { return this.svc.findAllPositions(); }
 
  @Get('positions/:id') @ApiOperation({ summary: 'Detalhe da posição de carreira' })
  position(@Param('id', ParseIntPipe) id: number) { return this.svc.findOnePosition(id); }
 
  @Get('users/:userId') @ApiOperation({ summary: 'Histórico de carreira do utilizador' })
  userHistory(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.getUserCareerHistory(userId);
  }
 
  @Get('my') @ApiOperation({ summary: 'Meu histórico de carreira' })
  myHistory(@CurrentUser() user: any) { return this.svc.getUserCareerHistory(user.id); }
 
  @Post('positions') @Roles('ADMIN', 'RH') @ApiOperation({ summary: 'Criar posição de carreira' })
  createPosition(@Body() dto: any) { return this.svc.createPosition(dto); }
 
  @Post('users/:userId/assign/:positionId') @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Atribuir posição de carreira a utilizador' })
  assign(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('positionId', ParseIntPipe) positionId: number,
  ) { return this.svc.assignCareerPosition(userId, positionId); }
}
