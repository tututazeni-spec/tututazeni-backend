import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';
import {
  CreateKnowledgeCategoryDto,
  UpdateKnowledgeCategoryDto,
  CreateKnowledgeArticleDto,
  UpdateKnowledgeArticleDto,
  KnowledgeFilterDto,
  KnowledgeInteractionDto,
  CreateCommentDto,
  RateArticleDto,
  CreateKnowledgeQuestionDto,
  AnswerQuestionDto,
  AcknowledgeArticleDto,
} from './knowledge.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import { Role } from '../auth/enums/role.enum';

@ApiTags('Knowledge Base')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly svc: KnowledgeService) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('admin/dashboard')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Dashboard admin (métricas, gaps, artigos desactualizados)' })
  dashboard() {
    return this.svc.getDashboard();
  }

  // ── Categorias ────────────────────────────────────────────────────────────

  @Get('categories')
  @ApiOperation({ summary: 'Listar categorias (com subcategorias e contagens)' })
  categories() {
    return this.svc.findAllCategories();
  }

  @Post('categories')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Criar categoria' })
  createCategory(@Body() dto: CreateKnowledgeCategoryDto) {
    return this.svc.createCategory(dto);
  }

  @Put('categories/:id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Actualizar categoria' })
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateKnowledgeCategoryDto) {
    return this.svc.updateCategory(id, dto);
  }

  // ── Catálogo ──────────────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar artigos publicados com filtros, paginação e ordenação' })
  findAll(@Query() filters: KnowledgeFilterDto) {
    return this.svc.findAll(filters);
  }

  @Get('trending')
  @ApiOperation({ summary: 'Artigos mais vistos' })
  @ApiQuery({ name: 'limit', required: false })
  trending(@Query('limit') limit?: string) {
    return this.svc.getTrending(limit ? parseInt(limit) : 10);
  }

  @Get('search')
  @ApiOperation({ summary: 'Pesquisa full-text (regista buscas sem resultado para gap analysis)' })
  @ApiQuery({ name: 'q', required: true })
  search(@Query('q') q: string, @CurrentUser() user: any) {
    return this.svc.searchFullText(q, user.id);
  }

  @Get('my/bookmarks')
  @ApiOperation({ summary: 'Os meus artigos guardados (bookmarks)' })
  myBookmarks(@CurrentUser() user: any) {
    return this.svc.getBookmarks(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do artigo (regista visualização única/30min)' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.id);
  }

  @Get(':id/versions')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Histórico de versões do artigo' })
  versions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getVersions(id);
  }

  @Get(':id/acknowledgements')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Relatório de confirmação de leitura (leu / não leu)' })
  acknowledgements(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAcknowledgementReport(id);
  }

  // ── Gestão (Admin/RH/Autor) ───────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Criar artigo (inicia como DRAFT)' })
  create(@CurrentUser() user: any, @Body() dto: CreateKnowledgeArticleDto) {
    return this.svc.create(user.id, dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Actualizar artigo (cria nova versão automaticamente)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: UpdateKnowledgeArticleDto,
  ) {
    return this.svc.update(id, dto, user.id);
  }

  @Patch(':id/publish')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Publicar artigo (DRAFT → PUBLISHED)' })
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseIntPipe) id: number) {
    return this.svc.publish(id);
  }

  @Patch(':id/archive')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Arquivar artigo' })
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number) {
    return this.svc.archive(id);
  }

  @Post(':id/versions/:versionId/restore')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Restaurar versão anterior do artigo' })
  restoreVersion(
    @Param('id', ParseIntPipe) id: number,
    @Param('versionId', ParseIntPipe) versionId: number,
    @CurrentUser() user: any,
  ) {
    return this.svc.restoreVersion(id, versionId, user.id);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.RH)
  @ApiOperation({ summary: 'Eliminar artigo (não permitido se obrigatório com confirmações)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(id);
  }

  // ── Interacções ───────────────────────────────────────────────────────────

  @Post('interact')
  @ApiOperation({ summary: 'Interagir com artigo (LIKE/BOOKMARK toggle, SHARE)' })
  @HttpCode(HttpStatus.OK)
  interact(@CurrentUser() user: any, @Body() dto: KnowledgeInteractionDto) {
    return this.svc.interact(user.id, dto);
  }

  @Post('rate')
  @ApiOperation({ summary: 'Avaliar artigo (1-5 estrelas)' })
  @HttpCode(HttpStatus.OK)
  rate(@CurrentUser() user: any, @Body() dto: RateArticleDto) {
    return this.svc.rateArticle(user.id, dto);
  }

  @Post('acknowledge')
  @ApiOperation({ summary: 'Confirmar leitura de artigo obrigatório ("Li e estou ciente")' })
  @HttpCode(HttpStatus.OK)
  acknowledge(@CurrentUser() user: any, @Body() dto: AcknowledgeArticleDto) {
    return this.svc.acknowledgeArticle(user.id, dto);
  }

  // ── Comentários ───────────────────────────────────────────────────────────

  @Post('comments')
  @ApiOperation({ summary: 'Comentar artigo (ou responder a comentário)' })
  createComment(@CurrentUser() user: any, @Body() dto: CreateCommentDto) {
    return this.svc.createComment(user.id, dto);
  }

  @Delete('comments/:commentId')
  @ApiOperation({ summary: 'Remover comentário próprio' })
  deleteComment(@Param('commentId', ParseIntPipe) commentId: number, @CurrentUser() user: any) {
    return this.svc.deleteComment(commentId, user.id);
  }

  // ── Q&A ───────────────────────────────────────────────────────────────────

  @Post('questions')
  @ApiOperation({ summary: 'Colocar pergunta num artigo' })
  createQuestion(@CurrentUser() user: any, @Body() dto: CreateKnowledgeQuestionDto) {
    return this.svc.createQuestion(user.id, dto);
  }

  @Post('questions/answer')
  @ApiOperation({ summary: 'Responder a uma pergunta' })
  @HttpCode(HttpStatus.OK)
  answerQuestion(@CurrentUser() user: any, @Body() dto: AnswerQuestionDto) {
    return this.svc.answerQuestion(user.id, dto);
  }
}
