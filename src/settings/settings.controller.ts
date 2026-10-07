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
import { DsrStatus } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, CurrentUserData, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';
import { SettingsService } from './settings.service';
import { SecuritySettingsService } from './security-settings.service';
import { NotificationSettingsService } from './notification-settings.service';
import { IntegrationSettingsService } from './integration-settings.service';
import { CertificateSettingsService } from './certificate-settings.service';
import { PrivacySettingsService } from './privacy-settings.service';
import { LicenseSettingsService } from './license-settings.service';
import { AuditDataSettingsService } from './audit-data-settings.service';
import { AuthSettingsService } from './auth-settings.service';
import { EmailSettingsService } from './email-settings.service';
import {
  CreateCertificateTemplateDto,
  CreateDataSubjectRequestDto,
  DisableTwoFactorDto,
  PublishConsentTextDto,
  SetDepartmentScopeDto,
  TestEmailTemplateDto,
  TestSmtpDto,
  TwoFactorCodeDto,
  UpdateAuthSettingsDto,
  UpdateCertificateSettingsDto,
  UpdateCertificateTemplateDto,
  UpdateDataSubjectRequestDto,
  UpdateEmailSettingsDto,
  UpdateIntegrationSettingsDto,
  UpdateModuleFlagsDto,
  UpdateNotificationSettingsDto,
  UpdateOrganizationSettingsDto,
  UpdatePrivacySettingsDto,
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
    private readonly certificates: CertificateSettingsService,
    private readonly privacy: PrivacySettingsService,
    private readonly license: LicenseSettingsService,
    private readonly auditData: AuditDataSettingsService,
    private readonly authSettings: AuthSettingsService,
    private readonly emailSettings: EmailSettingsService,
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

  // ─── §7 Certificados ──────────────────────────────────────────────────────

  @Get('certificates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Logo, assinatura, texto padrão e numeração dos certificados' })
  certificateSettings() {
    return this.certificates.get();
  }

  @Put('certificates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar definições globais dos certificados' })
  updateCertificateSettings(
    @Body() dto: UpdateCertificateSettingsDto,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.certificates.update(dto, admin.id);
  }

  @Get('certificates/templates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Biblioteca de templates de certificados' })
  listCertificateTemplates() {
    return this.certificates.listTemplates();
  }

  @Post('certificates/templates')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Criar um template de certificado' })
  createCertificateTemplate(
    @Body() dto: CreateCertificateTemplateDto,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.certificates.createTemplate(dto, admin.id);
  }

  @Put('certificates/templates/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar um template de certificado' })
  updateCertificateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateCertificateTemplateDto,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.certificates.updateTemplate(id, dto, admin.id);
  }

  @Delete('certificates/templates/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Remover um template de certificado (soft delete)' })
  deleteCertificateTemplate(@Param('id') id: string, @CurrentUser() admin: CurrentUserData) {
    return this.certificates.deleteTemplate(id, admin.id);
  }

  @Post('certificates/templates/:id/default')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Definir como predefinido do seu tipo' })
  setDefaultCertificateTemplate(@Param('id') id: string, @CurrentUser() admin: CurrentUserData) {
    return this.certificates.setDefaultTemplate(id, admin.id);
  }

  // ─── §8 Privacidade (LPDP) ────────────────────────────────────────────────

  @Get('privacy')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'DPO, retenção, anonimização e versão vigente do consentimento' })
  privacySettings() {
    return this.privacy.get();
  }

  @Put('privacy')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar definições de privacidade' })
  updatePrivacySettings(
    @Body() dto: UpdatePrivacySettingsDto,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.privacy.update(dto, admin.id);
  }

  @Get('privacy/consent/versions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Histórico de versões do texto de consentimento' })
  consentVersions() {
    return this.privacy.listConsentVersions();
  }

  @Post('privacy/consent/publish')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Publicar uma nova versão do texto de consentimento' })
  publishConsent(@Body() dto: PublishConsentTextDto, @CurrentUser() admin: CurrentUserData) {
    return this.privacy.publishConsentText(dto, admin.id);
  }

  @Get('privacy/requests')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Pedidos de direitos dos titulares' })
  @ApiQuery({ name: 'status', required: false, enum: DsrStatus })
  listDataSubjectRequests(
    @Query('status') status?: DsrStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.privacy.listRequests({
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('privacy/requests')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Registar um pedido de direitos de um titular' })
  createDataSubjectRequest(
    @Body() dto: CreateDataSubjectRequestDto,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.privacy.createRequest(dto, admin.id);
  }

  @Put('privacy/requests/:id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar o estado de um pedido de direitos de um titular' })
  updateDataSubjectRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDataSubjectRequestDto,
    @CurrentUser() admin: CurrentUserData,
  ) {
    return this.privacy.updateRequest(id, dto, admin.id);
  }

  // ─── §9 Licença e Módulos ─────────────────────────────────────────────────

  @Get('license')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Plano, utilizadores, validade, trial e módulos activos' })
  licenseSettings() {
    return this.license.get();
  }

  @Put('license/modules')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Activar/desactivar módulos (feature flags)' })
  updateModuleFlags(@Body() dto: UpdateModuleFlagsDto, @CurrentUser() admin: CurrentUserData) {
    return this.license.updateModules(dto, admin.id);
  }

  // ─── §10 Auditoria e Dados ────────────────────────────────────────────────
  // Consulta/edição detalhada em /audit/* (módulo próprio) — este endpoint é só
  // o resumo consumido pelo separador de Definições.

  @Get('audit')
  @Roles(Role.ADMIN, Role.AUDITOR)
  @ApiOperation({ summary: 'Resumo: saúde da auditoria, backups, política e exportações' })
  auditOverview() {
    return this.auditData.overview();
  }

  // ─── §11 Autenticação / SSO ───────────────────────────────────────────────

  @Get('auth')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'SSO (Google/Microsoft/OIDC), LDAP/Active Directory e domínio autorizado',
  })
  authSettingsView() {
    return this.authSettings.get();
  }

  @Put('auth')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar SSO e LDAP/AD' })
  updateAuthSettings(@Body() dto: UpdateAuthSettingsDto, @CurrentUser() admin: CurrentUserData) {
    return this.authSettings.update(dto, admin.id);
  }

  @Post('auth/test-oidc')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Testar a descoberta OIDC do fornecedor de SSO guardado' })
  testOidc() {
    return this.authSettings.testOidc();
  }

  @Post('auth/test-ldap')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Testar a ligação ao servidor LDAP/AD guardado' })
  testLdap() {
    return this.authSettings.testLdap();
  }

  // ─── §12 Email ────────────────────────────────────────────────────────────

  @Get('email')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'SMTP, assinatura e templates dos emails do sistema' })
  emailSettingsView() {
    return this.emailSettings.get();
  }

  @Put('email')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Actualizar assinatura, templates e/ou SMTP' })
  updateEmailSettings(@Body() dto: UpdateEmailSettingsDto, @CurrentUser() admin: CurrentUserData) {
    return this.emailSettings.update(dto, admin.id);
  }

  @Post('email/test')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Enviar um template com dados de exemplo para validar o resultado' })
  testEmailTemplate(@Body() dto: TestEmailTemplateDto, @CurrentUser() admin: CurrentUserData) {
    return this.emailSettings.testTemplate(dto.key, dto.to, admin.id);
  }
}
