import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ProcessStandardService } from './processstandard.service';
import { ProcessStandardController } from './processstandard.controller';

@Module({
  imports: [PrismaModule],
  providers: [ProcessStandardService],
  controllers: [ProcessStandardController],
})
export class ProcessStandardModule {}