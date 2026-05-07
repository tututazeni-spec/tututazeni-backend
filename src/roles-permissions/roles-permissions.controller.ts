// src/roles-permissions/roles-permissions.controller.ts
import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  RolesPermissionsService,
  CreateRoleDto, UpdateRoleDto, BulkAssignRoleDto,
  SimulatePermissionDto, RoleTemplateDto,
} from './roles-permissions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../common/guards/roles.guard';
import { Roles }        from '../common/decorators';

const ADMIN = ['ADMIN', 'RH'] as const;

@ApiTags('Roles & Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN)
@Controller('roles-permissions')
export class RolesPermissionsController {
  constructor(private readonly svc: RolesPermissionsService) {}

  // ─── Roles CRUD ───────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar todos os roles com permissões e nº de utilizadores' })
  findAll() { return this.svc.findAll(); }

  @Get('governance-stats')
  @ApiOperation({ summary: 'Estatísticas de governança — roles, permissões, alertas' })
  governance() { return this.svc.getGovernanceStats(); }

  @Get('matrix')
  @ApiOperation({ summary: 'Matriz de permissões × roles (para gestão visual)' })
  matrix() { return this.svc.getPermissionMatrix(); }

  @Get('users-without-role')
  @ApiOperation({ summary: 'Utilizadores sem role atribuído' })
  withoutRole() { return this.svc.getUsersWithoutRole(); }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um role com utilizadores (primeiros 20)' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Get(':id/users')
  @ApiOperation({ summary: 'Todos os utilizadores de um role' })
  usersInRole(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getUsersWithRole(id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar novo role com permissões' })
  create(@Body() dto: CreateRoleDto) { return this.svc.create(dto); }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar role (nome, descrição, permissões)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/clone')
  @ApiOperation({ summary: 'Clonar role (duplica permissões)' })
  clone(@Param('id', ParseIntPipe) id: number, @Body() body: { newName: string }) {
    return this.svc.cloneRole(id, body.newName);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover role (apenas se sem utilizadores)' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }

  // ─── Assignment ───────────────────────────────────────────────

  @Post(':roleId/assign/:userId')
  @ApiOperation({ summary: 'Atribuir role a utilizador (+ audit log + notificação)' })
  assign(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) { return this.svc.assignToUser(userId, roleId); }

  @Post('bulk-assign')
  @ApiOperation({ summary: 'Atribuição em massa de role a múltiplos utilizadores' })
  bulkAssign(@Body() dto: BulkAssignRoleDto) { return this.svc.bulkAssignRole(dto); }

  // ─── Permissions ──────────────────────────────────────────────

  @Patch(':roleId/permissions/add')
  @ApiOperation({ summary: 'Adicionar permissões a um role (sem apagar as existentes)' })
  addPermissions(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: { permissionIds: number[] },
  ) { return this.svc.addPermissionsToRole(roleId, body.permissionIds); }

  @Patch(':roleId/permissions/remove')
  @ApiOperation({ summary: 'Remover permissões de um role' })
  removePermissions(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: { permissionIds: number[] },
  ) { return this.svc.removePermissionsFromRole(roleId, body.permissionIds); }

  @Patch(':roleId/permissions/set')
  @ApiOperation({ summary: 'Definir permissões exactas de um role (substitui tudo)' })
  setPermissions(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() body: { permissionIds: number[] },
  ) { return this.svc.setRolePermissions(roleId, body.permissionIds); }

  // ─── Compare ──────────────────────────────────────────────────

  @Get('compare/:roleIdA/:roleIdB')
  @ApiOperation({ summary: 'Comparar dois roles (permissões em comum, únicas, overlap %)' })
  compare(
    @Param('roleIdA', ParseIntPipe) a: number,
    @Param('roleIdB', ParseIntPipe) b: number,
  ) { return this.svc.compareRoles(a, b); }

  // ─── Simulator ────────────────────────────────────────────────

  @Post('simulate')
  @ApiOperation({ summary: 'Simulador — testar permissão para utilizador (cadeia de decisão)' })
  simulate(@Body() dto: SimulatePermissionDto) { return this.svc.simulatePermission(dto); }

  // ─── Position Templates ───────────────────────────────────────

  @Get('templates/positions')
  @ApiOperation({ summary: 'Templates de role por cargo' })
  getTemplates() { return this.svc.getPositionTemplates(); }

  @Post('templates/positions')
  @ApiOperation({ summary: 'Criar template cargo → role' })
  createTemplate(@Body() dto: RoleTemplateDto) { return this.svc.createPositionTemplate(dto); }

  @Post('templates/apply/:positionId')
  @ApiOperation({ summary: 'Aplicar template de cargo a todos os utilizadores nessa posição' })
  applyTemplate(@Param('positionId', ParseIntPipe) positionId: number) {
    return this.svc.applyPositionTemplate(positionId);
  }
}
