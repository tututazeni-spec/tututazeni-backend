import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InstructorMarketplaceService } from './instructor-marketplace.service';
import { InstructorMarketplaceController } from './instructor-marketplace.controller';

@Module({
  controllers: [InstructorMarketplaceController],
  providers: [InstructorMarketplaceService, PrismaService],
  exports: [InstructorMarketplaceService],
})
export class InstructorMarketplaceModule {}