// src/avatar-training/avatar-training.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AvatarTrainingService } from './avatar-training.service';
import { AvatarTrainingController } from './avatar-training.controller';

@Module({
  imports: [PrismaModule],
  providers: [AvatarTrainingService],
  controllers: [AvatarTrainingController],
  exports: [AvatarTrainingService],
})
export class AvatarTrainingModule {}
