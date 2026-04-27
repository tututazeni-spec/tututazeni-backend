// ─── src/competency-map/competency-map.module.ts ─────────────────────────────

import { Module }                  from '@nestjs/common';
import { CompetencyMapService }    from './competency-map.service';
import { CompetencyMapController } from './competency-map.controller';
import { PrismaModule }            from '../prisma/prisma.module';
import { AuditModule }             from '../common/modules/audit.module';
 
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [CompetencyMapService],
  controllers: [CompetencyMapController],
  exports: [CompetencyMapService],
})
export class CompetencyMapModule {}
 

 
