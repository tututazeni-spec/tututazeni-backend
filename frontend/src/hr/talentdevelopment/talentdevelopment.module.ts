import { Module } from '@nestjs/common';
import { TalentDevelopmentService } from './talentdevelopment.service';
import { TalentDevelopmentController } from './talentdevelopment.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TalentDevelopmentController],
  providers: [TalentDevelopmentService],
  exports: [TalentDevelopmentService],
})
export class TalentDevelopmentModule {}