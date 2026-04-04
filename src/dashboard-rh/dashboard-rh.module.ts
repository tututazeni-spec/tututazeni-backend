import { Module } from '@nestjs/common';
import { DashboardRhService } from './dashboard-rh.service';
import { DashboardRhController } from './dashboard-rh.controller';
@Module({ providers: [DashboardRhService], controllers: [DashboardRhController], exports: [DashboardRhService] })
export class DashboardRhModule {}
 
