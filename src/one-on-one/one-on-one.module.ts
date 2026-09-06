// src/one-on-one/one-on-one.module.ts
import { Module } from '@nestjs/common';
import { OneOnOneService } from './one-on-one.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [OneOnOneService],
  exports: [OneOnOneService],
})
export class OneOnOneModule {}
