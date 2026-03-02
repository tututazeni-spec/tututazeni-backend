import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CareerService } from './career.service';
import { CareerController } from './career.controller';

@Module({
  imports: [PrismaModule],
  providers: [CareerService],
  controllers: [CareerController],
  exports: [CareerService],
})
export class CareerModule {}