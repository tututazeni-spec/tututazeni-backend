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
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UploadedFile,
  UseInterceptors,
  Response,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
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
  DeclarationFilterDto,
  CreateDeclarationTemplateDto,
  UpdateDeclarationTemplateDto,
  ChangeDeclarationStatusDto,
  ExportDeclarationDto,
} from './work-declaration.dto';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../common/guards/roles.guard';
import { Roles }         from '../common/decorators/roles.decorator';
import { Role }          from '../auth/enums/role.enum';
import { CurrentUser }   from '../common/decorators/current-user.decorator';
import { IAuthUser }     from '../common/interfaces/auth-user.interface';

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
  async create(
    @Body() dto: CreateDeclarationDto,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.createDeclaration((user as any).tenantId, String(user.id), dto);
  }

  @Get()
  @ApiOperation({ summary: 'List declarations with filters and pagination' })
  @ApiQuery({ name: 'status', required: false, enum: ['draft', 'issued', 'signed', 'expired', 'revoked'] })
  @ApiQuery({ name: 'type', required: false })
  @ApiQuery({ name: 'employeeId', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAll(
    @Query() filters: DeclarationFilterDto,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.listDeclarations((user as any).tenantId, String(user.id), (user as any).role, filters);
  }

  @Get('dashboard/stats')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Get dashboard statistics for work declarations' })
  async getDashboardStats(@CurrentUser() user: IAuthUser) {
    return this.workDeclarationService.getStats((user as any).tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single declaration by ID' })
  @ApiParam({ name: 'id', description: 'Declaration UUID' })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.getDeclaration((user as any).tenantId, String(user.id), (user as any).role, id);
  }

  @Patch(':id')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Update a declaration (only drafts)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeclarationDto,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.updateDeclaration((user as any).tenantId, String(user.id), id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a declaration (Admin only)' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.changeStatus((user as any).tenantId, String(user.id), id, { status: 'REVOKED' } as any);
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
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.requestDeclaration((user as any).tenantId, String(user.id), dto);
  }

  @Get('my/requests')
  @Roles(Role.EMPLOYEE, Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Employee fetches their own requests/declarations' })
  async getMyDeclarations(@CurrentUser() user: IAuthUser) {
    return this.workDeclarationService.listDeclarations((user as any).tenantId, String(user.id), 'EMPLOYEE', {} as any);
  }

  // ─────────────────────────────────────────────
  // LIFECYCLE — STATUS TRANSITIONS
  // ─────────────────────────────────────────────

  @Patch(':id/issue')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Issue (publish) a declaration — draft → issued' })
  async issueDeclaration(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.changeStatus((user as any).tenantId, String(user.id), id, { status: 'ISSUED' } as any);
  }

  @Post(':id/sign')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Sign a declaration (upload signature image or apply digital sig)' })
  @UseInterceptors(FileInterceptor('signatureFile'))
  @ApiConsumes('multipart/form-data')
  async signDeclaration(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SignDeclarationDto,
    @UploadedFile() signatureFile: Express.Multer.File,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.signDeclaration((user as any).tenantId, String(user.id), id, dto);
  }

  @Patch(':id/revoke')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Revoke an issued or signed declaration' })
  async revokeDeclaration(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeDeclarationStatusDto,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.changeStatus((user as any).tenantId, String(user.id), id, { status: 'REVOKED', ...dto } as any);
  }

  // ─────────────────────────────────────────────
  // EXPORT & DOWNLOAD
  // ─────────────────────────────────────────────

  @Post(':id/export/pdf')
  @ApiOperation({ summary: 'Export declaration as PDF (with optional watermark)' })
  async exportPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ExportDeclarationDto,
    @CurrentUser() user: IAuthUser,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<any> {
  const result = await this.workDeclarationService.exportDeclaration(
  (user as any).tenantId, String(user.id), id, { format: 'DOCX' } as any,
);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="declaration-${id}.pdf"` });
  return result;
}

  @Post(':id/export/docx')
  @ApiOperation({ summary: 'Export declaration as editable DOCX' })
  async exportDocx(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IAuthUser,
    @Response({ passthrough: true }) res: ExpressResponse,
  ): Promise<any> {
  const result = await this.workDeclarationService.exportDeclaration(
    (user as any).tenantId, String(user.id), id, { format: 'DOCX' } as any,
   );
  res.set({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename="declaration-${id}.docx"` });
  return result;
}

  @Post(':id/send-email')
  @Roles(Role.HR, Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send declaration via email to employee or arbitrary recipient' })
  async sendByEmail(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('recipientEmail') recipientEmail: string,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.sendDeclaration((user as any).tenantId, String(user.id), id, { recipientEmails: [recipientEmail], generateSecureLink: false } as any);
  }

  @Get(':id/secure-link')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Generate a time-limited secure download link' })
  async generateSecureLink(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IAuthUser,
  ) {
    return { link: this.workDeclarationService.generateSecureLink(id) };
  }

  // ─────────────────────────────────────────────
  // VERIFICATION (PUBLIC — no auth)
  // ─────────────────────────────────────────────

  @Get('verify/:code')
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
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.listTemplates((user as any).tenantId, { type, locale: language } as any);
  }

  @Get('templates/:id')
  @ApiOperation({ summary: 'Get a single template by ID' })
  async getTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.getTemplate((user as any).tenantId, id);
  }

  @Post('templates')
  @Roles(Role.HR, Role.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new declaration template' })
  async createTemplate(
    @Body() dto: CreateDeclarationTemplateDto,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.createTemplate((user as any).tenantId, String(user.id), dto);
  }

  @Patch('templates/:id')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Update an existing template' })
  async updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDeclarationTemplateDto,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.updateTemplate((user as any).tenantId, String(user.id), id, dto);
  }

  @Delete('templates/:id')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a template (Admin only)' })
  async deleteTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.deleteTemplate((user as any).tenantId, id);
  }

  @Post('templates/:id/preview')
  @ApiOperation({ summary: 'Preview a template rendered with sample or real employee data' })
  async previewTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('employeeId') employeeId: string,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.previewTemplate((user as any).tenantId, { templateId: id, employeeId } as any);
  }

  // ─────────────────────────────────────────────
  // AUDIT LOG
  // ─────────────────────────────────────────────

  @Get(':id/audit-log')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Retrieve full audit trail for a declaration' })
  async getAuditLog(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.getAuditLogs((user as any).tenantId, id);
  }

  // ─────────────────────────────────────────────
  // COMPANY BRANDING (per-tenant)
  // ─────────────────────────────────────────────

  @Post('branding/logo')
  @Roles(Role.ADMIN)
  @UseInterceptors(FileInterceptor('logo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload company logo used in declaration header' })
  async uploadLogo(
    @UploadedFile() logo: Express.Multer.File,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.upsertTenantConfig((user as any).tenantId, { logoUrl: logo?.originalname } as any);
  }

  @Get('branding/settings')
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Retrieve company branding/layout settings' })
  async getBrandingSettings(@CurrentUser() user: IAuthUser) {
    return this.workDeclarationService.getTenantConfig((user as any).tenantId);
  }

  @Patch('branding/settings')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update company branding settings (header, footer, layout)' })
  async updateBrandingSettings(
    @Body() settings: Record<string, unknown>,
    @CurrentUser() user: IAuthUser,
  ) {
    return this.workDeclarationService.upsertTenantConfig((user as any).tenantId, settings as any);
  }
}