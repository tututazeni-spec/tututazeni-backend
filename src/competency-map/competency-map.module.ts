import { Module } from '@nestjs/common';
import { CompetencyMapService } from './competency-map.service';
import { CompetencyMapController } from './competency-map.controller';
@Module({ providers: [CompetencyMapService], controllers: [CompetencyMapController], exports: [CompetencyMapService] })
export class CompetencyMapModule {}
 

 
