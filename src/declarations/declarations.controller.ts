// ─── src/declarations/declarations.controller.ts ─────────────────────────────
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DocumentDeclarationsService } from './document-declarations.service';
import { WorkDeclarationsService }     from './work-declarations.service';
import {
  DocumentRequestFilterDto, WorkDeclFilterDto,
  CreateDeclarationPurposeDto,
  CreateTemplateDto, UpdateTemplateDto,
  CreateDocumentRequestDto, ApproveDocumentRequestDto,
  CreateWorkDeclFormDto, UpdateWorkDeclFormDto,
  SubmitWorkDeclDto, ReviewWorkDeclDto, BulkApproveWorkDeclDto,
  WorkDeclType,
} from './declarations.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard }   from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
// ─── MODULE 1 — DOCUMENT DECLARATIONS ────────────────────────────────────────
 
@ApiTags('Declarations — Documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('declarations/documents')
export class DocumentDeclarationsController {
  constructor(private readonly svc: DocumentDeclarationsService) {}
 
  // Dashboard
  @Get('dashboard')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Dashboard de declarações — KPIs e top templates' })
  getDashboard() { return this.svc.getDashboard(); }
 
  // Purposes
  @Get('purposes')
  @ApiOperation({ summary: 'Listar finalidades de declaração' })
  @ApiQuery({ name: 'activeOnly', required: false, type: Boolean })
  getPurposes(@Query('activeOnly') ao?: string) { return this.svc.getPurposes(ao !== 'false'); }
 
  @Post('purposes')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar finalidade de declaração' })
  createPurpose(@Body() dto: CreateDeclarationPurposeDto) { return this.svc.createPurpose(dto); }
 
  @Patch('purposes/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar finalidade' })
  updatePurpose(@Param('id', ParseIntPipe) id: number, @Body() dto: Partial<CreateDeclarationPurposeDto>) {
    return this.svc.updatePurpose(id, dto);
  }
 
  // Templates
  @Get('templates')
  @ApiOperation({ summary: 'Listar templates de declaração' })
  @ApiQuery({ name: 'purposeId', required: false, type: Number })
  @ApiQuery({ name: 'language', required: false })
  getTemplates(
    @Query('purposeId') purposeId?: string,
    @Query('language') language?: string,
    @Query('activeOnly') activeOnly?: string,
  ) { return this.svc.getTemplates(purposeId ? +purposeId : undefined, language, activeOnly !== 'false'); }
 
  @Get('templates/:id')
  @ApiOperation({ summary: 'Detalhe do template' })
  getTemplate(@Param('id', ParseIntPipe) id: number) { return this.svc.getTemplate(id); }
 
  @Get('templates/:id/preview')
  @ApiOperation({ summary: 'Preview do template com dados do colaborador' })
  previewTemplate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.previewTemplate(id, user.id);
  }
 
  @Post('templates')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar template (HTML com {{variáveis}})' })
  createTemplate(@Body() dto: CreateTemplateDto, @CurrentUser() user: any) {
    return this.svc.createTemplate(dto, user.id);
  }
 
  @Patch('templates/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar template (auto-incrementa versão)' })
  updateTemplate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser() user: any,
  ) { return this.svc.updateTemplate(id, dto, user.id); }
 
  // Requests
  @Get()
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar pedidos de declaração com filtros' })
  findAll(@Query() filters: DocumentRequestFilterDto) { return this.svc.findAll(filters); }
 
  @Get('my')
  @ApiOperation({ summary: 'Meus pedidos de declaração' })
  myRequests(@CurrentUser() user: any) {
    return this.svc.findAll({ userId: user.id });
  }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe de um pedido' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.id);
  }
 
  @Post()
  @ApiOperation({ summary: 'Solicitar declaração (self-service)' })
  request(@CurrentUser() user: any, @Body() dto: CreateDocumentRequestDto) {
    return this.svc.request(user.id, dto);
  }
 
  @Patch(':id/approve')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Aprovar ou rejeitar pedido' })
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: ApproveDocumentRequestDto,
  ) { return this.svc.approve(id, user.id, dto); }
 
  @Patch(':id/generate')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Gerar documento com resolução de variáveis' })
  generate(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.generate(id, user.id);
  }
 
  @Patch(':id/issue')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Marcar declaração como emitida' })
  issue(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.issue(id, user.id);
  }
 
  @Get('verify/:code')
  @ApiOperation({ summary: 'Verificação pública de declaração por código (sem auth)' })
  verify(@Param('code') code: string) { return this.svc.verify(code); }
}
 
// ─── MODULE 2 — WORK DECLARATIONS ────────────────────────────────────────────
 
@ApiTags('Declarations — Work')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('declarations/work')
export class WorkDeclarationsController {
  constructor(private readonly svc: WorkDeclarationsService) {}
 
  // Dashboard & Analytics
  @Get('dashboard')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Dashboard de work declarations — KPIs de compliance' })
  @ApiQuery({ name: 'department', required: false })
  getDashboard(@Query('department') department?: string) { return this.svc.getDashboard(department); }
 
  @Get('compliance-report')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Relatório de compliance por colaborador' })
  @ApiQuery({ name: 'department', required: false })
  getComplianceReport(@Query('department') department?: string) {
    return this.svc.getComplianceReport(department);
  }
 
  // Forms (Admin/RH)
  @Get('forms')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar formulários de declaração' })
  @ApiQuery({ name: 'type', enum: WorkDeclType, required: false })
  getForms(
    @Query('type') type?: WorkDeclType,
    @Query('activeOnly') activeOnly?: string,
  ) { return this.svc.getForms(type, activeOnly !== 'false'); }
 
  @Get('forms/:id')
  @ApiOperation({ summary: 'Detalhe do formulário (com perguntas)' })
  getForm(@Param('id', ParseIntPipe) id: number) { return this.svc.getForm(id); }
 
  @Post('forms')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar formulário dinâmico (form builder)' })
  createForm(@Body() dto: CreateWorkDeclFormDto, @CurrentUser() user: any) {
    return this.svc.createForm(dto, user.id);
  }
 
  @Patch('forms/:id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Actualizar formulário' })
  updateForm(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWorkDeclFormDto,
    @CurrentUser() user: any,
  ) { return this.svc.updateForm(id, dto, user.id); }
 
  @Post('forms/:id/remind')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Enviar lembrete aos colaboradores que não submeteram' })
  sendReminder(
    @Param('id', ParseIntPipe) id: number,
    @Query('department') department?: string,
  ) { return this.svc.sendReminder(id, department); }
 
  // My pending (Employee)
  @Get('my/pending')
  @ApiOperation({ summary: 'Formulários pendentes para o utilizador actual' })
  getPending(@CurrentUser() user: any) { return this.svc.getPendingForUser(user.id); }
 
  @Get('my/submissions')
  @ApiOperation({ summary: 'Minhas submissões' })
  mySubmissions(@CurrentUser() user: any) {
    return this.svc.findSubmissions({ userId: user.id });
  }
 
  // Submissions (Admin/RH)
  @Get('submissions')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Listar submissões com filtros' })
  findSubmissions(@Query() filters: WorkDeclFilterDto) { return this.svc.findSubmissions(filters); }
 
  @Get('submissions/:id')
  @ApiOperation({ summary: 'Detalhe de uma submissão' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOneSubmission(id); }
 
  @Post('submit')
  @ApiOperation({ summary: 'Submeter declaração (suporta rascunho, assinatura digital)' })
  submit(@CurrentUser() user: any, @Body() dto: SubmitWorkDeclDto) {
    return this.svc.submit(user.id, dto);
  }
 
  @Patch('submissions/:id/review')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Aprovar, rejeitar ou pedir correcção' })
  review(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewWorkDeclDto,
    @CurrentUser() user: any,
  ) { return this.svc.review(id, dto, user.id); }
 
  @Post('submissions/bulk-approve')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Aprovação em lote' })
  bulkApprove(@Body() dto: BulkApproveWorkDeclDto, @CurrentUser() user: any) {
    return this.svc.bulkApprove(dto, user.id);
  }
 
  @Patch('submissions/:id/exempt')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Marcar como isento' })
  exempt(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { reason: string },
    @CurrentUser() user: any,
  ) { return this.svc.exemptUser(id, body.reason, user.id); }
 
  // Auto-triggers
  @Post('trigger/onboarding/:userId')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Disparar declarações de onboarding para um novo colaborador' })
  triggerOnboarding(@Param('userId', ParseIntPipe) userId: number) {
    return this.svc.triggerOnboarding(userId);
  }
 
  @Post('trigger/periodic')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Processar lembretes de declarações periódicas (cron)' })
  triggerPeriodic() { return this.svc.triggerPeriodic(); }
}