// src/roles-permissions/roles-permissions.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesPermissionsService, CreatePermissionRoleDto, UpdateRoleDto } from './roles-permissions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators';
 
@ApiTags('Roles & Permissions (Funções e Permissões)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('roles-permissions')
export class RolesPermissionsController {
  constructor(private readonly svc: RolesPermissionsService) {}
 
  @Get() @ApiOperation({ summary: 'Listar todos os roles com permissões' })
  findAll() { return this.svc.findAll(); }
 
  @Get(':id') @ApiOperation({ summary: 'Detalhe de um role' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post() @ApiOperation({ summary: 'Criar novo role' })
  create(@Body() dto: CreatePermissionRoleDto) { return this.svc.create(dto); }
 
  @Put(':id') @ApiOperation({ summary: 'Actualizar role' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.svc.update(id, dto);
  }
 
  @Post(':roleId/assign/:userId') @ApiOperation({ summary: 'Atribuir role a utilizador' })
  assign(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Param('userId', ParseIntPipe) userId: number,
  ) { return this.svc.assignToUser(userId, roleId); }
 
  @Delete(':id') @ApiOperation({ summary: 'Remover role' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 
