import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../../prisma/prisma.service';
import { LiveService } from './live.service';
import { LiveController } from './live.controller';

@Module({
  imports: [HttpModule],
  controllers: [LiveController],
  providers: [LiveService, PrismaService],
  exports: [LiveService],
})
export class LiveModule {}