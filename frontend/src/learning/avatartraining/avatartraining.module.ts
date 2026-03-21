import { Module } from '@nestjs/common';
import { AvatarTrainingService } from './avatartraining.service';
import { AvatarTrainingController } from './avatartraining.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [AvatarTrainingService],
  controllers: [AvatarTrainingController],
})
export class AvatarTrainingModule {}
