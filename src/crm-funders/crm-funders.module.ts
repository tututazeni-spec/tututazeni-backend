import { Module } from '@nestjs/common';
import { CrmFundersController } from './crm-funders.controller';
import { CrmFundersService } from './crm-funders.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CrmFundersController],
  providers: [CrmFundersService],
  exports: [CrmFundersService],
})
export class CrmFundersModule {}
