// src/recycle-bin/recycle-bin.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RecycleBinController } from './recycle-bin.controller';
import { RecycleBinService } from './recycle-bin.service';

@Module({
  imports: [PrismaModule],
  controllers: [RecycleBinController],
  providers: [RecycleBinService],
})
export class RecycleBinModule {}
