import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';
import { ContentLibraryController } from '../content-library/content-library.controller';
import { ContentLibraryService } from '../content-library/content-library.service';
import { KnowledgeController } from '../knowledge/knowledge.controller';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { PrismaModule } from '../prisma/prisma.module';

// Módulo unificado da Biblioteca: funde o antigo `ContentLibraryModule`
// (catálogo multimédia — cursos/vídeos/artigos com progresso, trending,
// recomendações, analytics — rotas `/content-library/*`), o antigo
// `KnowledgeModule` (base de conhecimento — artigos, categorias, tags,
// comentários, perguntas, versões — rotas `/knowledge/*`) e o
// `LibraryModule` original (repositório documental — itens/colecções,
// aprovação, comentários, avaliações — rotas `/library/*`).
//
// Os três conjuntos de rotas e o seu comportamento mantêm-se intactos —
// esta fusão é só de wiring (um único módulo Nest, uma única entrada no
// sidebar "Biblioteca") — nenhum endpoint, DTO ou modelo Prisma foi
// alterado. Os modelos Prisma não se sobrepõem (`libraryItem`/
// `libraryCollection`/… vs `contentAsset`/`userPoints`/… vs
// `knowledgeArticle`/`knowledgeCategory`/…), por isso não há risco de
// colisão de dados.
@Module({
  imports: [PrismaModule],
  controllers: [LibraryController, ContentLibraryController, KnowledgeController],
  providers: [LibraryService, ContentLibraryService, KnowledgeService],
  exports: [LibraryService, ContentLibraryService, KnowledgeService],
})
export class LibraryModule {}
