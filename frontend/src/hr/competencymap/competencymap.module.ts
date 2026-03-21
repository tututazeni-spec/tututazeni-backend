import { Module } from '@nestjs/common';
import { CompetencyMapService } from './competencymap.service';
import { CompetencyMapController } from './competencymap.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CompetencyMapService],
  controllers: [CompetencyMapController],
})
export class CompetencyMapModule {}