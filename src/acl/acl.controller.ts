import { Controller, Get, Post, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AclService } from './acl.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';

@ApiTags('ACL (Controlo de Acessos)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('acl')
export class AclController {
  constructor(private readonly svc: AclService) {}

  @Get('my-permissions') @ApiOperation({ summary: 'Minhas permissões actuais' })
  myPermissions(@CurrentUser() user: any) { return this.svc.getUserPermissions(user.id); }

  @Get('permissions') @Roles('ADMIN') @ApiOperation({ summary: 'Listar todas as permissões' })
  allPermissions() { return this.svc.getAllPermissions(); }

  @Get('roles/:roleId/permissions') @Roles('ADMIN')
  @ApiOperation({ summary: 'Permissões de um role' })
  rolePermissions(@Param('roleId', ParseIntPipe) id: number) { return this.svc.getRolePermissions(id); }

  // FIX: body actualizado para incluir action, subject e roleId (obrigatórios no schema)
  @Post('permissions') @Roles('ADMIN') @ApiOperation({ summary: 'Criar nova permissão' })
  create(@Body() body: { name: string; action: string; subject: string; roleId: number }) {
    return this.svc.createPermission(body.name, body.action, body.subject, body.roleId);
  }

  @Post('roles/:roleId/permissions/:permissionId') @Roles('ADMIN')
  @ApiOperation({ summary: 'Atribuir permissão a role' })
  assign(
    @Param('roleId', ParseIntPipe) rId: number,
    @Param('permissionId', ParseIntPipe) pId: number,
  ) { return this.svc.assignPermissionToRole(rId, pId); }

  @Delete('roles/:roleId/permissions/:permissionId') @Roles('ADMIN')
  @ApiOperation({ summary: 'Revogar permissão de role' })
  revoke(
    @Param('roleId', ParseIntPipe) rId: number,
    @Param('permissionId', ParseIntPipe) pId: number,
  ) { return this.svc.revokePermissionFromRole(rId, pId); }
}
