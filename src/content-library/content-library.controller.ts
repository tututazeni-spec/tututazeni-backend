// src/content-library/content-library.controller.ts
import {
  Controller, Get, Post, Put, Patch, Delete,
  Param, Body, Query, Req,
  ParseIntPipe, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ContentLibraryService }  from './content-library.service';
import { JwtAuthGuard }  from '../common/guards/jwt-auth.guard';
import { RolesGuard }    from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import {
  CreateContentDto, UpdateContentDto, ContentFilterDto,
  RateContentDto, UpdateProgressDto, SaveNoteDto,
  CreateLearningPathDto, LearningPathFilterDto,
} from './content-library.dto';

const ALL_ROLES     = ['ADMIN', 'RH', 'LIDER', 'COLABORADOR', 'INSTRUCTOR'] as const;
const AUTHOR_ROLES  = ['ADMIN', 'RH', 'INSTRUCTOR']                          as const;
const ADMIN_ROLES   = ['ADMIN', 'RH']                                         as const;

@ApiTags('Content Library')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('content-library')
export class ContentLibraryController {
  constructor(private readonly svc: ContentLibraryService) {}

  // ─── Catalogue ────────────────────────────────────────────────

  @Get()
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Catálogo com busca full-text e filtros (format, level, category, tags…)' })
  findAll(@Query() filters: ContentFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('trending')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Conteúdos em trending (mais vistos nos últimos 7 dias)' })
  trending(@Query('limit') limit?: string) {
    return this.svc.getTrending(limit ? +limit : 10);
  }

  @Get('new')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Conteúdos adicionados recentemente' })
  newContent(@Query('limit') limit?: string) {
    return this.svc.getNewContent(limit ? +limit : 10);
  }

  @Get('recommended')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Conteúdos recomendados para mim (baseado em perfil + histórico)' })
  recommended(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.svc.getRecommended(user.id, limit ? +limit : 10);
  }

  @Get('mandatory')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Conteúdos obrigatórios com o meu progresso' })
  mandatory(@CurrentUser() user: any) {
    return this.svc.getMandatory(user.id);
  }

  @Get('bookmarks')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Os meus conteúdos guardados' })
  bookmarks(@CurrentUser() user: any) {
    return this.svc.getMyBookmarks(user.id);
  }

  @Get('continue-watching')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Continuar a ver — conteúdos em progresso' })
  continueWatching(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.svc.getContinueWatching(user.id, limit ? +limit : 5);
  }

  @Get('categories')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Distribuição de conteúdos por formato/categoria' })
  categories() { return this.svc.getCategoryBreakdown(); }

  @Get('tags')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Todas as tags disponíveis' })
  tags() { return this.svc.getAllTags(); }

  // ─── Single Content ───────────────────────────────────────────

  @Get(':id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Detalhe do conteúdo (com rating, progresso do utilizador)' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.id);
  }

  @Post()
  @Roles(...AUTHOR_ROLES)
  @ApiOperation({ summary: 'Criar novo conteúdo (vai para DRAFT, precisa de publicação)' })
  create(@CurrentUser() user: any, @Body() dto: CreateContentDto) {
    return this.svc.create(user.id, dto);
  }

  @Put(':id')
  @Roles(...AUTHOR_ROLES)
  @ApiOperation({ summary: 'Actualizar conteúdo completo' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContentDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.update(id, dto, user.id);
  }

  @Post(':id/publish')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Publicar conteúdo (DRAFT → ACTIVE + bump version)' })
  publish(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.publish(id, user.id);
  }

  @Post(':id/deprecate')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Marcar conteúdo como obsoleto' })
  deprecate(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deprecate(id);
  }

  // ─── Interactions ─────────────────────────────────────────────

  @Patch(':id/view')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Registar visualização (deduplicado por dia)' })
  view(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.view(id, user.id);
  }

  @Patch(':id/bookmark')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Guardar / remover dos guardados (toggle)' })
  bookmark(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.bookmark(id, user.id);
  }

  // ─── Progress ─────────────────────────────────────────────────

  @Patch(':id/progress')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Actualizar progresso (% + tempo + última posição)' })
  updateProgress(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProgressDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.updateProgress(id, user.id, dto);
  }

  @Get('my/progress')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Histórico de progresso pessoal + estatísticas' })
  myProgress(@CurrentUser() user: any) {
    return this.svc.getMyProgress(user.id);
  }

  // ─── Ratings ──────────────────────────────────────────────────

  @Post(':id/rate')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Avaliar conteúdo (1–5 estrelas + comentário)' })
  rate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RateContentDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.rateContent(id, user.id, dto);
  }

  @Get(':id/ratings')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Avaliações de um conteúdo (média + distribuição + comentários)' })
  ratings(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getContentRatings(id);
  }

  // ─── Notes ────────────────────────────────────────────────────

  @Post(':id/note')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Guardar nota pessoal num conteúdo' })
  saveNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SaveNoteDto,
    @CurrentUser() user: any,
  ) {
    return this.svc.saveNote(id, user.id, dto);
  }

  @Get(':id/note')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Obter a minha nota num conteúdo' })
  getNote(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.getMyNote(id, user.id);
  }

  // ─── Learning Paths ───────────────────────────────────────────

  @Get('paths/all')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Listar learning paths' })
  getLearningPaths(@Query() filters: LearningPathFilterDto) {
    return this.svc.getLearningPaths(filters);
  }

  @Get('paths/:id')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Detalhe de learning path com progresso do utilizador' })
  getLearningPath(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.getLearningPath(id, user.id);
  }

  @Post('paths')
  @Roles(...AUTHOR_ROLES)
  @ApiOperation({ summary: 'Criar learning path com sequência de conteúdos' })
  createLearningPath(@Body() dto: CreateLearningPathDto, @CurrentUser() user: any) {
    return this.svc.createLearningPath(dto, user.id);
  }

  @Post('paths/:id/enroll')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'Inscrever-se numa learning path' })
  enrollPath(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.enrollLearningPath(id, user.id);
  }

  // ─── Analytics ────────────────────────────────────────────────

  @Get('analytics/dashboard')
  @Roles(...ADMIN_ROLES)
  @ApiOperation({ summary: 'Dashboard de analytics (conteúdos mais vistos, conclusões, formatos)' })
  analyticsDashboard(@Query('departmentId') departmentId?: string) {
    return this.svc.getAnalyticsDashboard(departmentId ? +departmentId : undefined);
  }

  @Get('analytics/my-stats')
  @Roles(...ALL_ROLES)
  @ApiOperation({ summary: 'As minhas estatísticas pessoais de consumo' })
  myStats(@CurrentUser() user: any) {
    return this.svc.getUserAnalytics(user.id);
  }
}