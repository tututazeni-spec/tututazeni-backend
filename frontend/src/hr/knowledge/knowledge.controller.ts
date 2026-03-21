import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { Prisma } from '@prisma/client';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Post('articles')
  createArticle(@Body() data: Prisma.KnowledgeArticleCreateInput) {
    return this.knowledgeService.createArticle(data);
  }

  @Get('articles')
  listArticles() {
    return this.knowledgeService.listArticles();
  }

  @Get('articles/:id')
  getArticle(@Param('id') id: string) {
    return this.knowledgeService.getArticleById(Number(id));
  }

  @Post('interactions')
  createInteraction(@Body() data: Prisma.KnowledgeInteractionCreateInput) {
    return this.knowledgeService.createInteraction(data);
  }

  @Get('categories')
  listCategories() {
    return this.knowledgeService.listCategories();
  }
}