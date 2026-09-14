// src/career/career.module.ts
// Módulo único "Carreira" — junta o perfil/trilhas/vagas/sucessão pessoal
// (CareerController, histórico) com o motor de planos/readiness/promoções
// por cargo (CareerPlansController, ex-módulo career-plans). Continuam a
// existir dois controllers (rotas /career e /career-plans preservadas tal
// como estavam — nenhum consumidor, frontend incluído, muda de URL) porque
// escrevem em modelos parcialmente sobrepostos com vocabulários/DTOs
// próprios (ver memory project_innova_career_pdi_module_duplication) — unir
// os controllers num só teria colisões de rota (`paths`, `succession`,
// `analytics` existem nos dois) sem trazer nenhum benefício real.
import { Module } from '@nestjs/common';
import { CareerService } from './career.service';
import { CareerController } from './career.controller';
import { CareerPlansService } from './career-plans.service';
import { CareerPlansController } from './career-plans.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { SuccessionModule } from '../succession/succession.module';
import { AuditModule } from '../common/modules/audit.module';

@Module({
  imports: [PrismaModule, SuccessionModule, AuditModule],
  providers: [CareerService, CareerPlansService],
  controllers: [CareerController, CareerPlansController],
  exports: [CareerService, CareerPlansService],
})
export class CareerModule {}
