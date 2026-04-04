import { Module } from '@nestjs/common';
import { RoiImpactService } from './roi-impact.service';
import { RoiImpactController } from './roi-impact.controller';
@Module({ providers: [RoiImpactService], controllers: [RoiImpactController], exports: [RoiImpactService] })
export class RoiImpactModule {}
 
