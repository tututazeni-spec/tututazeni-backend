// src/competencies/competencies.module.ts
import { Module } from '@nestjs/common';
import { CompetenciesService } from './competencies.service';
import { CompetenciesController } from './competencies.controller';
import { CompetencyMapController } from '../competency-map/competency-map.controller';
import { CompetencyMapService } from '../competency-map/competency-map.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../common/modules/audit.module';

// Módulo unificado "Competências": funde o catálogo/perfil/skill-matrix
// original (`CompetenciesController`, rotas `/competencies/*`) com o
// antigo `CompetencyMapModule` (heatmap, matriz por cargo, gap
// organizacional, rotas `/competency-map/*`) — ex-CompetencyMapModule,
// fundido aqui.
//
// Os dois conjuntos de rotas e o seu comportamento mantêm-se intactos —
// esta fusão é só de wiring (um único módulo Nest, uma única entrada no
// sidebar "Competências") — nenhum endpoint, DTO ou modelo Prisma foi
// alterado. Os modelos Prisma não se sobrepõem (`competency`/
// `userCompetency`/… vs `skill`/`legacyEmployeeSkill`/…), por isso não
// há risco de colisão de dados.
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [CompetenciesService, CompetencyMapService],
  controllers: [CompetenciesController, CompetencyMapController],
  exports: [CompetenciesService, CompetencyMapService],
})
export class CompetenciesModule {}
