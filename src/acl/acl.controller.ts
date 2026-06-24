// src/acl/acl.controller.ts
import {
  Controller,
  Get,
  Post,
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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AclService } from './acl.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import {
  CreatePermissionDto,
  BulkAssignPermissionsDto,
  CreateRoleDto,
  CloneRoleDto,
  CreatePolicyDto,
  CheckPermissionDto,
  AssignRoleToUserDto,
  AclAuditFilterDto,
} from './acl.dto';
import { Role } from '../auth/enums/role.enum';

const ADMIN = ['ADMIN', 'RH'] as const;

@ApiTags('ACL — Access Control')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('acl')
export class AclController {
  constructor(private readonly svc: AclService) {}

  // ─── My permissions ───────────────────────────────────────────

  @Get('my-permissions')
  @Roles(
    Role.ADMIN,
    Role.RH,
    Role.LIDER,
    Role.COLABORADOR,
    Role.INSTRUCTOR,
    Role.AUDITOR,
    Role.DIRECTOR,
  )
  @ApiOperation({ summary: 'As minhas permissões actuais (cached)' })
  myPermissions(@CurrentUser() user: CurrentUserData) {
    return this.svc.getUserPermissions(user.id);
  }

  // ─── Permissions ──────────────────────────────────────────────

  @Get('permissions')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Listar todas as permissões' })
  allPermissions() {
    return this.svc.getAllPermissions();
  }

  @Post('permissions')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Criar nova permissão' })
  createPermission(@Body() dto: CreatePermissionDto) {
    return this.svc.createPermission(dto);
  }

  // ─── Roles ────────────────────────────────────────────────────

  @Get('roles')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Listar roles com permissões e nº de utilizadores' })
  getRoles() {
    return this.svc.getRoles();
  }

  @Get('roles/:id')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Detalhe de um role' })
  getRole(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getRole(id);
  }

  @Post('roles')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Criar role customizado' })
  createRole(@Body() dto: CreateRoleDto) {
    return this.svc.createRole(dto);
  }

  @Patch('roles/:id')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Actualizar role' })
  updateRole(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateRoleDto>) {
    return this.svc.updateRole(id, dto);
  }

  @Post('roles/:id/clone')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Clonar role existente' })
  cloneRole(@Param('id', ParseIntPipe) id: number, @Body() dto: CloneRoleDto) {
    return this.svc.cloneRole(id, dto);
  }

  @Get('roles/:roleId/permissions')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Permissões de um role' })
  rolePermissions(@Param('roleId', ParseIntPipe) id: number) {
    return this.svc.getRolePermissions(id);
  }

  @Post('roles/:roleId/permissions/:permissionId')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Atribuir permissão a role' })
  assign(
    @Param('roleId', ParseIntPipe) rId: number,
    @Param('permissionId', ParseIntPipe) pId: number,
  ) {
    return this.svc.assignPermissionToRole(rId, pId);
  }

  @Delete('roles/:roleId/permissions/:permissionId')
  @Roles(...ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revogar permissão de role' })
  revoke(
    @Param('roleId', ParseIntPipe) rId: number,
    @Param('permissionId', ParseIntPipe) pId: number,
  ) {
    return this.svc.revokePermissionFromRole(rId, pId);
  }

  @Post('roles/bulk-assign')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Atribuir múltiplas permissões a um role (bulk)' })
  bulkAssign(@Body() dto: BulkAssignPermissionsDto) {
    return this.svc.bulkAssignPermissions(dto);
  }

  // ─── User ↔ Role ──────────────────────────────────────────────

  @Post('users/assign-role')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Atribuir role a utilizador (invalida cache)' })
  assignRole(@Body() dto: AssignRoleToUserDto) {
    return this.svc.assignRoleToUser(dto);
  }

  // ─── Permission check ─────────────────────────────────────────

  @Post('check')
  @Roles(...ADMIN, Role.LIDER, Role.COLABORADOR, Role.INSTRUCTOR, Role.AUDITOR, Role.DIRECTOR)
  @ApiOperation({ summary: 'Verificar se utilizador tem permissão para acção+subject' })
  check(@Body() dto: CheckPermissionDto) {
    return this.svc.checkPermission(dto);
  }

  // ─── Permission matrix ────────────────────────────────────────

  @Get('matrix')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Matriz de permissões — roles × permissões' })
  matrix() {
    return this.svc.getPermissionMatrix();
  }

  // ─── Policies (ABAC/PBAC) ────────────────────────────────────

  @Get('policies')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Listar políticas de acesso (ABAC/PBAC)' })
  getPolicies() {
    return this.svc.getPolicies();
  }

  @Post('policies')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Criar política de acesso (condition JSON, effect ALLOW/DENY)' })
  createPolicy(@Body() dto: CreatePolicyDto, @CurrentUser() user: CurrentUserData) {
    return this.svc.createPolicy(dto, user.id);
  }

  // ─── Audit ────────────────────────────────────────────────────

  @Get('audit')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Audit log de alterações de ACL' })
  auditLog(@Query() filters: AclAuditFilterDto) {
    return this.svc.getAuditLog(filters);
  }

  @Get('audit/denied')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Log de acessos negados' })
  deniedLog(@Query() filters: AclAuditFilterDto) {
    return this.svc.getDeniedLog(filters);
  }

  // ─── Stats ────────────────────────────────────────────────────

  @Get('stats')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Estatísticas de ACL — distribuição de roles, tentativas negadas' })
  stats() {
    return this.svc.getStats();
  }

  // ─── Seed ────────────────────────────────────────────────────

  @Post('seed-permissions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[ADMIN] Criar permissões built-in (35+) se não existirem' })
  seedPermissions() {
    return this.svc.seedBuiltinPermissions();
  }
}
