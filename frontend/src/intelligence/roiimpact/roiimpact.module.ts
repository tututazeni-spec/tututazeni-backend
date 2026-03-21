import { Module } from '@nestjs/common';
import { RoiImpactService } from './roiimpact.service';
import { RoiImpactController } from './roiimpact.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [RoiImpactService],
  controllers: [RoiImpactController],
  exports: [RoiImpactService],
})
export class RoiImpactModule {}
