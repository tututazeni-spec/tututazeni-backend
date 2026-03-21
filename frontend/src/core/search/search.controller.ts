import { Controller, Get, Query, Post, Body, Delete } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // 🔎 Buscar
  @Get()
  search(@Query('q') query: string) {
    return this.searchService.globalSearch(query);
  }

  // ➕ Indexar manualmente
  @Post('index')
  index(
    @Body()
    body: {
      entityType: string;
      entityId: number;
      title: string;
      description?: string;
      route?: string;
    },
  ) {
    return this.searchService.indexEntity(
      body.entityType,
      body.entityId,
      body.title,
      body.description,
      body.route,
    );
  }

  // 🗑 Remover
  @Delete()
  remove(@Query('entityType') entityType: string, @Query('entityId') entityId: string) {
    return this.searchService.removeFromIndex(entityType, Number(entityId));
  }

  // 📚 Listar tudo
  @Get('all')
  listAll() {
    return this.searchService.listIndex();
  }
}