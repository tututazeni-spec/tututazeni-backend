// src/search/search.controller.ts
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators';
 
@ApiTags('Search (Pesquisa Global)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(private readonly svc: SearchService) {}
 
  @Get() @ApiOperation({ summary: 'Pesquisa global — colaboradores, cursos, documentos, conteúdos' })
  search(@Query('q') q: string, @CurrentUser() user: any) {
    return this.svc.globalSearch(q, user.id);
  }
}
 
