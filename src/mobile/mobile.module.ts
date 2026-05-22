import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MobileService } from './mobile.service';
import { MobileController } from './mobile.controller';

@Module({
  providers: [MobileService, PrismaService],
  controllers: [MobileController],
})
export class MobileModule {}
