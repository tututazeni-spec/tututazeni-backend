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
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesPermissionsService } from '../roles-permissions/roles-permissions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles, CurrentUserData } from '../common/decorators';
import {
  CreatePermissionDto,
  BulkAssignPermissionsDto,
  CreateRoleDto,
  CloneRoleDto,
  AssignRoleToUserDto,
  AclAuditFilterDto,
} from './acl.dto';
import { Role } from '../auth/enums/role.enum';

// Fase D: rotas /acl/* passam a delegar no serviço canónico RolesPermissionsService.
// O motor ABAC (policies/check) foi removido — enforcement continua no RolesGuard.
const ADMIN = [Role.ADMIN, Role.RH] as const;

@ApiTags('ACL — Access Control')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('acl')
export class AclController {
  constructor(private readonly svc: RolesPermissionsService) {}

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
    return this.svc.findAll();
  }

  @Get('roles/:id')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Detalhe de um role' })
  // Adaptador: o contrato histórico de /acl/roles/:id devolvia 200 + null para
  // um role inexistente; RolesPermissionsService.findOne lança NotFoundException.
  async getRole(@Param('id', ParseIntPipe) id: number) {
    try {
      return await this.svc.findOne(id);
    } catch (e) {
      if (e instanceof NotFoundException) return null;
      throw e;
    }
  }

  @Post('roles')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Criar role customizado' })
  createRole(@Body() dto: CreateRoleDto) {
    return this.svc.create(dto);
  }

  @Patch('roles/:id')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Actualizar role' })
  updateRole(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateRoleDto>) {
    return this.svc.update(id, dto);
  }

  @Post('roles/:id/clone')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Clonar role existente' })
  cloneRole(@Param('id', ParseIntPipe) id: number, @Body() dto: CloneRoleDto) {
    return this.svc.cloneRole(id, dto.newName);
  }

  @Get('roles/:roleId/permissions')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Permissões de um role' })
  async rolePermissions(@Param('roleId', ParseIntPipe) id: number) {
    try {
      return await this.svc.findOne(id);
    } catch (e) {
      if (e instanceof NotFoundException) return null;
      throw e;
    }
  }

  @Post('roles/:roleId/permissions/:permissionId')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Atribuir permissão a role' })
  assign(
    @Param('roleId', ParseIntPipe) rId: number,
    @Param('permissionId', ParseIntPipe) pId: number,
  ) {
    return this.svc.addPermissionsToRole(rId, [pId]);
  }

  @Delete('roles/:roleId/permissions/:permissionId')
  @Roles(...ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revogar permissão de role' })
  revoke(
    @Param('roleId', ParseIntPipe) rId: number,
    @Param('permissionId', ParseIntPipe) pId: number,
  ) {
    return this.svc.removePermissionsFromRole(rId, [pId]);
  }

  @Post('roles/bulk-assign')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Atribuir múltiplas permissões a um role (bulk)' })
  bulkAssign(@Body() dto: BulkAssignPermissionsDto) {
    return this.svc.addPermissionsToRole(dto.roleId, dto.permissionIds);
  }

  // ─── User ↔ Role ──────────────────────────────────────────────

  @Post('users/assign-role')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Atribuir role a utilizador (invalida cache)' })
  assignRole(@Body() dto: AssignRoleToUserDto) {
    return this.svc.assignRoleToUser(dto);
  }

  // ─── Permission matrix ────────────────────────────────────────

  @Get('matrix')
  @Roles(...ADMIN)
  @ApiOperation({ summary: 'Matriz de permissões — roles × permissões' })
  matrix() {
    return this.svc.getPermissionMatrix();
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
}
