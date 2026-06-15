import { Module } from '@nestjs/common';
import { CrmBeneficiariesController } from './crm-beneficiaries.controller';
import { CrmBeneficiariesService } from './crm-beneficiaries.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CrmBeneficiariesController],
  providers: [CrmBeneficiariesService],
  exports: [CrmBeneficiariesService],
})
export class CrmBeneficiariesModule {}
