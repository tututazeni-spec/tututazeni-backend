// src/search/search.controller.ts
import { Controller, Get, Delete, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
import { GlobalSearchDto, TypedSearchDto, AutocompleteDto, SearchEntityType } from './search.dto';

const ADMIN = ['ADMIN', 'RH'] as const;

@ApiTags('Search — Universal Search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly svc: SearchService) {}

  // ─── Global search ────────────────────────────────────────────

  @Get()
  @ApiOperation({
    summary: 'Pesquisa global — colaboradores, cursos, conteúdos, PDIs, documentos, competências',
  })
  globalSearch(@Query() dto: GlobalSearchDto, @CurrentUser() user: any) {
    return this.svc.globalSearch(dto.q, user.id, dto);
  }

  // ─── Typed searches ───────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Pesquisa de colaboradores (nome, email, cargo, departamento)' })
  users(@Query() dto: TypedSearchDto, @CurrentUser() user: any) {
    return this.svc.searchByType(SearchEntityType.USER, dto.q, user.id, dto);
  }

  @Get('courses')
  @ApiOperation({ summary: 'Pesquisa de cursos (título, categoria, descrição)' })
  courses(@Query() dto: TypedSearchDto, @CurrentUser() user: any) {
    return this.svc.searchByType(SearchEntityType.COURSE, dto.q, user.id, dto);
  }

  @Get('content')
  @ApiOperation({ summary: 'Pesquisa de conteúdos (ContentAsset)' })
  content(@Query() dto: TypedSearchDto, @CurrentUser() user: any) {
    return this.svc.searchByType(SearchEntityType.CONTENT, dto.q, user.id, dto);
  }

  @Get('documents')
  @ApiOperation({ summary: 'Pesquisa de documentos e artigos de conhecimento' })
  documents(@Query() dto: TypedSearchDto, @CurrentUser() user: any) {
    return this.svc.searchByType(SearchEntityType.DOCUMENT, dto.q, user.id, dto);
  }

  @Get('pdi')
  @ApiOperation({ summary: 'Pesquisa de planos de desenvolvimento (PDI)' })
  pdis(@Query() dto: TypedSearchDto, @CurrentUser() user: any) {
    return this.svc.searchByType(SearchEntityType.PDI, dto.q, user.id, dto);
  }

  @Get('competencies')
  @ApiOperation({ summary: 'Pesquisa de competências' })
  competencies(@Query() dto: TypedSearchDto, @CurrentUser() user: any) {
    return this.svc.searchByType(SearchEntityType.COMPETENCY, dto.q, user.id, dto);
  }

  @Get('scenarios')
  @ApiOperation({ summary: 'Pesquisa de cenários de avatar training' })
  scenarios(@Query() dto: TypedSearchDto, @CurrentUser() user: any) {
    return this.svc.searchByType(SearchEntityType.SCENARIO, dto.q, user.id, dto);
  }

  // ─── Autocomplete ─────────────────────────────────────────────

  @Get('autocomplete')
  @ApiOperation({ summary: 'Sugestões em tempo real (autocomplete + histórico recente)' })
  autocomplete(@Query() dto: AutocompleteDto, @CurrentUser() user: any) {
    return this.svc.autocomplete(dto.q, user.id, dto.limit ?? 5);
  }

  // ─── Suggestions ──────────────────────────────────────────────

  @Get('suggestions')
  @ApiOperation({
    summary: 'Sugestões personalizadas — cursos recomendados, conteúdo popular, trending',
  })
  suggestions(@CurrentUser() user: any) {
    return this.svc.getSuggestions(user.id);
  }

  // ─── History ──────────────────────────────────────────────────

  @Get('history')
  @ApiOperation({ summary: 'Histórico de pesquisas do utilizador' })
  history(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.svc.getHistory(user.id, limit ? +limit : 20);
  }

  @Delete('history')
  @ApiOperation({ summary: 'Limpar histórico de pesquisas' })
  clearHistory(@CurrentUser() user: any) {
    return this.svc.clearHistory(user.id);
  }

  // ─── Analytics ────────────────────────────────────────────────

  @Get('analytics')
  @UseGuards(RolesGuard)
  @Roles(...ADMIN)
  @ApiOperation({
    summary: 'Analytics de pesquisa — top termos, zero resultados, utilizadores únicos',
  })
  analytics() {
    return this.svc.getAnalytics();
  }
}
