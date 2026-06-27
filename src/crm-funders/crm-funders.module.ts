import { Module } from '@nestjs/common';
import { CrmFundersController } from './crm-funders.controller';
import { CrmFundersService } from './crm-funders.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [CrmFundersController],
  providers: [CrmFundersService],
  exports: [CrmFundersService],
})
export class CrmFundersModule {}
