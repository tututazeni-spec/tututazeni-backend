// src/settings/settings.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
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
import { SecuritySettingsService } from './security-settings.service';
import { NotificationSettingsService } from './notification-settings.service';
import { IntegrationSettingsService } from './integration-settings.service';
import {
  DisableTwoFactorDto,
  SetDepartmentScopeDto,
  TestSmtpDto,
  TwoFactorCodeDto,
  UpdateIntegrationSettingsDto,
  UpdateNotificationSettingsDto,
  UpdateOrganizationSettingsDto,
  UpdateSecurityPolicyDto,
  UpdateUserPolicyDto,
} from './settings.dto';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(
    private readonly svc: SettingsService,
    private readonly security: SecuritySettingsService,
    private readonly notifications: NotificationSettingsService,
    private readonly integrations: IntegrationSettingsService,
  ) {}

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

  // ─── §4 Segurança (admin) ─────────────────────────────────────────────────

  @Get('security/policy')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Política de segurança (palavra-passe, bloqueio, sessão, 2FA)' })
  securityPolicy() {
    return this.security.getPolicyView();
  }

  @Put('security/policy')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar política de segurança' })
  updateSecurityPolicy(
    @Body() dto: UpdateSecurityPolicyDto,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.security.updatePolicy(dto, admin.id);
  }

  @Get('security/locked-users')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Contas bloqueadas por tentativas falhadas' })
  lockedUsers() {
    return this.security.listLockedUsers();
  }

  @Post('security/users/:id/unlock')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Desbloquear uma conta' })
  unlock(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: CurrentUserData) {
    return this.security.unlockUser(id, admin.id);
  }

  @Post('security/users/:id/reset-2fa')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Repor o 2FA de um utilizador (termina as suas sessões)' })
  reset2fa(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: CurrentUserData) {
    return this.security.resetTwoFactor(id, admin.id);
  }

  @Get('security/sessions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Sessões activas (todas, ou de um utilizador)' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  sessions(@Query('userId') userId?: string) {
    return this.security.listSessions(userId ? Number(userId) : undefined);
  }

  @Delete('security/sessions/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Terminar uma sessão' })
  revokeSession(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: CurrentUserData) {
    return this.security.revokeSession(id, admin.id);
  }

  @Delete('security/users/:id/sessions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Terminar todas as sessões de um utilizador' })
  revokeUserSessions(@Param('id', ParseIntPipe) id: number, @CurrentUser() admin: CurrentUserData) {
    return this.security.revokeAllUserSessions(id, admin.id);
  }

  @Get('security/login-history')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Histórico de logins (sucesso/falha) da organização' })
  @ApiQuery({ name: 'userId', required: false, type: Number })
  @ApiQuery({ name: 'outcome', required: false, enum: ['SUCCESS', 'FAILED'] })
  loginHistory(
    @Query('userId') userId?: string,
    @Query('outcome') outcome?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.security.loginHistory({
      userId: userId ? Number(userId) : undefined,
      outcome: outcome === 'SUCCESS' || outcome === 'FAILED' ? outcome : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  // ─── §4 Segurança (pessoal — qualquer utilizador autenticado) ─────────────

  @Get('security/me/2fa')
  @ApiOperation({ summary: 'Estado do meu 2FA e modo exigido pela organização' })
  my2fa(@CurrentUser() user: CurrentUserData) {
    return this.security.getTwoFactorStatus(user.id);
  }

  @Post('security/me/2fa/setup')
  @ApiOperation({ summary: 'Iniciar configuração do 2FA (devolve segredo e otpauth URL)' })
  setup2fa(@CurrentUser() user: CurrentUserData) {
    return this.security.setupTwoFactor(user.id);
  }

  @Post('security/me/2fa/enable')
  @ApiOperation({ summary: 'Confirmar e activar o 2FA com um código TOTP' })
  enable2fa(@Body() dto: TwoFactorCodeDto, @CurrentUser() user: CurrentUserData) {
    return this.security.enableTwoFactor(user.id, dto.code);
  }

  @Post('security/me/2fa/disable')
  @ApiOperation({ summary: 'Desactivar o 2FA (exige código TOTP)' })
  disable2fa(@Body() dto: DisableTwoFactorDto, @CurrentUser() user: CurrentUserData) {
    return this.security.disableTwoFactor(user.id, dto.code);
  }

  @Get('security/me/sessions')
  @ApiOperation({ summary: 'As minhas sessões activas' })
  mySessions(@CurrentUser() user: CurrentUserData) {
    return this.security.listSessions(user.id);
  }

  @Delete('security/me/sessions/:id')
  @ApiOperation({ summary: 'Terminar uma das minhas sessões' })
  revokeMySession(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: CurrentUserData) {
    return this.security.revokeSession(id, user.id, true);
  }

  @Get('security/me/login-history')
  @ApiOperation({ summary: 'O meu histórico de logins' })
  myLoginHistory(@CurrentUser() user: CurrentUserData, @Query('page') page?: string) {
    return this.security.loginHistory({ userId: user.id, page: page ? Number(page) : undefined });
  }

  // ─── §5 Notificações ──────────────────────────────────────────────────────

  @Get('notifications')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Canais, eventos e horário de envio das notificações' })
  notificationSettings() {
    return this.notifications.get();
  }

  @Put('notifications')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar definições de notificações' })
  updateNotificationSettings(
    @Body() dto: UpdateNotificationSettingsDto,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.notifications.update(dto, admin.id);
  }

  // ─── §6 Integrações ───────────────────────────────────────────────────────

  @Get('integrations')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'SMTP, WhatsApp e Ísis (sem segredos)' })
  integrationSettings() {
    return this.integrations.get();
  }

  @Put('integrations')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar SMTP, WhatsApp e Ísis' })
  updateIntegrationSettings(
    @Body() dto: UpdateIntegrationSettingsDto,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.integrations.update(dto, admin.id);
  }

  @Get('integrations/overview')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Resumo: integrações, chaves de API e webhooks' })
  integrationsOverview() {
    return this.integrations.overview();
  }

  @Post('integrations/smtp/test')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Enviar email de teste com o SMTP guardado' })
  testSmtp(@Body() dto: TestSmtpDto, @CurrentUser() admin: CurrentUserData) {
    return this.integrations.testSmtp(dto.to, admin.id);
  }

  @Get('integrations/whatsapp/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Estado da ligação WhatsApp e consumo face aos limites' })
  whatsAppStatus() {
    return this.integrations.whatsAppStatus();
  }
}
