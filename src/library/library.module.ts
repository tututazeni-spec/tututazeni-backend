import { Module } from '@nestjs/common';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';
import { ContentLibraryController } from '../content-library/content-library.controller';
import { ContentLibraryService } from '../content-library/content-library.service';
import { PrismaModule } from '../prisma/prisma.module';

// Módulo unificado da Biblioteca: funde o antigo `ContentLibraryModule`
// (catálogo multimédia — cursos/vídeos/artigos com progresso, trending,
// recomendações, analytics — rotas `/content-library/*`) com o
// `LibraryModule` original (repositório documental — itens/colecções,
// aprovação, comentários, avaliações — rotas `/library/*`).
//
// Os dois conjuntos de rotas e o seu comportamento mantêm-se intactos —
// esta fusão é só de wiring (um único módulo Nest, uma única entrada no
// sidebar "Biblioteca") — nenhum endpoint, DTO ou modelo Prisma foi
// alterado. Os modelos Prisma não se sobrepõem (`libraryItem`/
// `libraryCollection`/… vs `contentAsset`/`userPoints`/…), por isso não há
// risco de colisão de dados.
@Module({
  imports: [PrismaModule],
  controllers: [LibraryController, ContentLibraryController],
  providers: [LibraryService, ContentLibraryService],
  exports: [LibraryService, ContentLibraryService],
})
export class LibraryModule {}
