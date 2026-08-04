import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Response,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { Response as ExpressResponse } from 'express';

import { WorkDeclarationService } from './work-declaration.service';
import {
  CreateDeclarationDto,
  UpdateDeclarationDto,
  RequestDeclarationDto,
  SignDeclarationDto,
  DeclarationQueryDto,
  DeclarationStatus,
  DeclarationType,
  DeclarationLocale,
  CreateDeclarationTemplateDto,
  UpdateDeclarationTemplateDto,
  ChangeDeclarationStatusDto,
  ExportDeclarationDto,
  UpsertTenantConfigDto,
  UploadLogoDto,
} from './work-declaration.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CurrentUserData } from '../common/types/current-user';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Work Declarations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('work-declarations')
export class WorkDeclarationController {
  constructor(private readonly workDeclarationService: WorkDeclarationService) {}

  // ─────────────────────────────────────────────
  // DECLARATIONS — CRUD
  // ─────────────────────────────────────────────

  @Post()
  @Roles(Role.HR, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new work declaration (HR/Admin)' })
  @ApiResponse({ status: 201, description: 'Declaration created successfully.' })
  // tenantId chega sempre undefined — ver comentário em
  // WorkDeclarationService.resolveTenantId() (auto-resolve para o tenant
  // "DEFAULT"). Não existe tenantId em CurrentUserData/User.
  async create(@Body() dto: CreateDeclarationDto, @CurrentUser() user: CurrentUserData) {
    return this.workDeclarationService.createDeclaration(undefined, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List declarations with filters and pagination' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['draft', 'issued', 'signed', 'expired', 'revoked'],
  })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(@Query() filters: DeclarationQueryDto, @CurrentUser() user: CurrentUserData) {
    return this.workDeclarationService.listDeclarations(undefined, user, filters);
  }

  @Get('dashboard/stats')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Get dashboard statistics for work declarations' })
  async getDashboardStats() {
    return this.workDeclarationService.getStats(undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single declaration by ID' })
  @ApiParam({ name: 'id', description: 'Declaration ID (cuid)' })
  async findOne(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.workDeclarationService.getDeclaration(undefined, user, id);
  }

  @Patch(':id')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Update a declaration (only drafts)' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateDeclarationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workDeclarationService.updateDeclaration(undefined, user.id, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a declaration (Admin only)' })
  async remove(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.workDeclarationService.changeStatus(undefined, user.id, id, {
      status: DeclarationStatus.REVOKED,
    });
  }

  // ─────────────────────────────────────────────
  // EMPLOYEE — REQUEST FLOW
  // ─────────────────────────────────────────────

  @Post('request')
  @Roles(Role.EMPLOYEE, Role.HR, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Employee requests a new declaration' })
  async requestDeclaration(
    @Body() dto: RequestDeclarationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workDeclarationService.requestDeclaration(undefined, user.id, dto);
  }

  @Get('my/requests')
  @Roles(Role.EMPLOYEE, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Employee fetches their own requests/declarations' })
  async getMyDeclarations(@CurrentUser() user: CurrentUserData) {
    return this.workDeclarationService.listDeclarations(undefined, user, {});
  }

  // ─────────────────────────────────────────────
  // LIFECYCLE — STATUS TRANSITIONS
  // ─────────────────────────────────────────────

  @Patch(':id/issue')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Issue (publish) a declaration — draft → issued' })
  async issueDeclaration(@Param('id') id: string, @CurrentUser() user: CurrentUserData) {
    return this.workDeclarationService.changeStatus(undefined, user.id, id, {
      status: DeclarationStatus.ISSUED,
    });
  }

  @Post(':id/sign')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Sign a declaration (upload signature image or apply digital sig)' })
  async signDeclaration(
    @Param('id') id: string,
    @Body() dto: SignDeclarationDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workDeclarationService.signDeclaration(undefined, user.id, id, dto);
  }

  @Patch(':id/revoke')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Revoke an issued or signed declaration' })
  async revokeDeclaration(
    @Param('id') id: string,
    @Body() dto: ChangeDeclarationStatusDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workDeclarationService.changeStatus(undefined, user.id, id, {
      ...dto,
      status: DeclarationStatus.REVOKED,
    });
  }

  // ─────────────────────────────────────────────
  // EXPORT & DOWNLOAD
  // ─────────────────────────────────────────────

  @Post(':id/export/pdf')
  @ApiOperation({ summary: 'Export declaration as PDF (with optional watermark)' })
  async exportPdf(
    @Param('id') id: string,
    @Body() dto: ExportDeclarationDto,
    @CurrentUser() user: CurrentUserData,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    // FIX: chamava exportDeclaration com format 'DOCX' num endpoint que
    // devolve/anuncia PDF — nunca gerava mesmo um PDF.
    const result = await this.workDeclarationService.exportDeclaration(undefined, user.id, id, {
      format: 'PDF',
      includeWatermark: dto.includeWatermark,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="declaration-${id}.pdf"`,
    });
    return result;
  }

  @Post(':id/export/docx')
  @ApiOperation({ summary: 'Export declaration as editable DOCX' })
  async exportDocx(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserData,
    @Response({ passthrough: true }) res: ExpressResponse,
  ) {
    const result = await this.workDeclarationService.exportDeclaration(undefined, user.id, id, {
      format: 'DOCX',
    });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="declaration-${id}.docx"`,
    });
    return result;
  }

  @Post(':id/send-email')
  @Roles(Role.HR, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send declaration via email to employee or arbitrary recipient' })
  async sendByEmail(
    @Param('id') id: string,
    @Body('recipientEmail') recipientEmail: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workDeclarationService.sendDeclaration(undefined, user.id, id, {
      recipientEmails: [recipientEmail],
      generateSecureLink: false,
    });
  }

  @Get(':id/secure-link')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Generate a time-limited secure download link' })
  async generateSecureLink(@Param('id') id: string) {
    return { link: this.workDeclarationService.generateSecureLink(id) };
  }

  // ─────────────────────────────────────────────
  // VERIFICATION (PUBLIC — no auth)
  // ─────────────────────────────────────────────

  @Get('verify/:code')
  @Public()
  @ApiOperation({ summary: 'Publicly verify a declaration by its unique code (QR / URL)' })
  async verifyDeclaration(@Param('code') code: string) {
    return this.workDeclarationService.verifyDeclaration({ code });
  }

  // ─────────────────────────────────────────────
  // TEMPLATES
  // ─────────────────────────────────────────────

  @Get('templates/library')
  @ApiOperation({ summary: 'List all available declaration templates' })
  async getTemplates(
    @Query('type') type: string,
    @Query('language') language: string,
    @Query('isActive') isActive: string,
    @Query('search') search: string,
  ) {
    // type/language chegam como string livre de @Query() (sem DTO/ValidationPipe
    // por trás) — os casts documentam que não há garantia de serem valores
    // reais dos enums antes de chegar ao Prisma.
    return this.workDeclarationService.listTemplates(undefined, {
      type: type as DeclarationType | undefined,
      locale: language as DeclarationLocale | undefined,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      search,
    });
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get a single template by ID' })
  async getTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.workDeclarationService.getTemplate(undefined, id);
  }

  @Post('templates')
  @Roles(Role.HR, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new declaration template' })
  async createTemplate(
    @Body() dto: CreateDeclarationTemplateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workDeclarationService.createTemplate(undefined, user.id, dto);
  }

  @Patch('templates/:id')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Update an existing template' })
  async updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDeclarationTemplateDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    return this.workDeclarationService.updateTemplate(undefined, user.id, id, dto);
  }

  @Delete('templates/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a template (Admin only)' })
  async deleteTemplate(@Param('id', ParseIntPipe) id: number) {
    return this.workDeclarationService.deleteTemplate(undefined, id);
  }

  @Post('templates/:id/preview')
  @ApiOperation({ summary: 'Preview a template rendered with sample or real employee data' })
  async previewTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body('employeeId') employeeId: number,
  ) {
    return this.workDeclarationService.previewTemplate(undefined, {
      templateId: id,
      employeeId: employeeId !== undefined ? Number(employeeId) : undefined,
    });
  }

  // ─────────────────────────────────────────────
  // AUDIT LOG
  // ─────────────────────────────────────────────

  @Get(':id/audit-log')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Retrieve full audit trail for a declaration' })
  async getAuditLog(@Param('id') id: string) {
    return this.workDeclarationService.getAuditLogs(undefined, id);
  }

  // ─────────────────────────────────────────────
  // COMPANY BRANDING (per-tenant)
  // ─────────────────────────────────────────────

  @Post('branding/logo')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Set company logo URL used in declaration header' })
  async uploadLogo(@Body() dto: UploadLogoDto) {
    return this.workDeclarationService.upsertTenantConfig(undefined, {
      logoUrl: dto.fileUrl,
    });
  }

  @Get('branding/settings')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Retrieve company branding/layout settings' })
  async getBrandingSettings() {
    return this.workDeclarationService.getTenantConfig(undefined);
  }

  @Patch('branding/settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update company branding settings (header, footer, layout)' })
  async updateBrandingSettings(@Body() dto: UpsertTenantConfigDto) {
    return this.workDeclarationService.upsertTenantConfig(undefined, dto);
  }
}
