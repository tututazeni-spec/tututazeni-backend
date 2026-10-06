// src/settings/settings.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { SettingsService } from './settings.service';
import {
  SetDepartmentScopeDto,
  UpdateOrganizationSettingsDto,
  UpdateUserPolicyDto,
} from './settings.dto';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly svc: SettingsService) {}

  // Qualquer utilizador autenticado: nome da plataforma, logo e formatos.
  @Get('branding')
  @ApiOperation({ summary: 'Branding e formatos da organização (não sensível)' })
  branding() {
    return this.svc.getBranding();
  }

  @Get('organization')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Definições da organização (Visão Geral)' })
  organization() {
    return this.svc.getOrganization();
  }

  @Put('organization')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar definições da organização' })
  updateOrganization(
    @Body() dto: UpdateOrganizationSettingsDto,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.svc.updateOrganization(dto, admin.id);
  }

  @Get('users/policy')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Política de utilizadores' })
  userPolicy() {
    return this.svc.getUserPolicy();
  }

  @Put('users/policy')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar política de utilizadores' })
  updateUserPolicy(@Body() dto: UpdateUserPolicyDto, @CurrentUser() admin: CurrentUserData) {
    return this.svc.updateUserPolicy(dto, admin.id);
  }

  @Get('permissions/department-scope')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Âmbito por departamento de cada perfil' })
  departmentScopes() {
    return this.svc.getDepartmentScopes();
  }

  @Put('permissions/department-scope/:roleId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Definir departamentos visíveis a um perfil (vazio = todos)' })
  setDepartmentScope(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: SetDepartmentScopeDto,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.svc.setDepartmentScope(roleId, dto.departmentIds, admin.id);
  }

  @Get('users/overview')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Contadores de utilizadores por estado' })
  usersOverview() {
    return this.svc.getUsersOverview();
  }

  @Get('users/inactive')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Utilizadores inactivos (sem login há N dias)' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  inactive(@Query('days') days?: string) {
    const n = days ? Number(days) : undefined;
    return this.svc.listInactiveUsers(n && n > 0 ? n : undefined);
  }
}
