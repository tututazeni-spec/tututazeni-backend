import {
  Controller, Get, Post, Put, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { KnowledgeService } from './knowledge.service';
import {
  CreateKnowledgeArticleDto, UpdateKnowledgeArticleDto,
  KnowledgeFilterDto, KnowledgeInteractionDto, CreateKnowledgeCategoryDto,
} from './knowledge.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Knowledge Base')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly svc: KnowledgeService) {}
 
  @Get('categories')
  @ApiOperation({ summary: 'Listar categorias do knowledge base' })
  categories() { return this.svc.findAllCategories(); }
 
  @Post('categories')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Criar categoria' })
  createCategory(@Body() dto: CreateKnowledgeCategoryDto) { return this.svc.createCategory(dto); }
 
  @Get()
  @ApiOperation({ summary: 'Listar artigos' })
  findAll(@Query() filters: KnowledgeFilterDto) { return this.svc.findAll(filters); }
 
  @Get('trending')
  @ApiOperation({ summary: 'Artigos em tendência (últimos 7 dias)' })
  trending(@Query('limit') limit?: number) { return this.svc.getTrending(limit); }
 
  @Get('search')
  @ApiOperation({ summary: 'Pesquisa full-text em artigos' })
  search(@Query('q') q: string) { return this.svc.searchFullText(q); }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do artigo (regista visualização)' })
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.svc.findOne(id, user.id);
  }
 
  @Post()
  @ApiOperation({ summary: 'Criar artigo' })
  create(@CurrentUser() user: any, @Body() dto: CreateKnowledgeArticleDto) {
    return this.svc.create(user.id, dto);
  }
 
  @Post('interact')
  @ApiOperation({ summary: 'Interagir com artigo (LIKE, BOOKMARK, SHARE)' })
  interact(@CurrentUser() user: any, @Body() dto: KnowledgeInteractionDto) {
    return this.svc.interact(user.id, dto);
  }
 
  @Put(':id')
  @ApiOperation({ summary: 'Atualizar artigo' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateKnowledgeArticleDto) {
    return this.svc.update(id, dto);
  }
 
  @Delete(':id')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Remover artigo' })
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }
}
 
