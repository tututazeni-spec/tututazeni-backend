import { Module } from '@nestjs/common';
import { CrmPartnersController } from './crm-partners.controller';
import { CrmPartnersService } from './crm-partners.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CrmPartnersController],
  providers: [CrmPartnersService],
  exports: [CrmPartnersService],
})
export class CrmPartnersModule {}
