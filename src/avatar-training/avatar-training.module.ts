// src/avatar-training/avatar-training.module.ts
import { Module } from '@nestjs/common';
import { AvatarTrainingService } from './avatar-training.service';
import { AvatarTrainingController } from './avatar-training.controller';

@Module({
  providers: [AvatarTrainingService],
  controllers: [AvatarTrainingController],
  exports: [AvatarTrainingService],
})
export class AvatarTrainingModule {}