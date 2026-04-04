import { Module } from '@nestjs/common';
import { PayslipsService } from './payslips.service';
import { PayslipsController } from './payslips.controller';
@Module({ providers: [PayslipsService], controllers: [PayslipsController], exports: [PayslipsService] })
export class PayslipsModule {}
 

 
