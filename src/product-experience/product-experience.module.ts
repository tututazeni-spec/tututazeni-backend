import { Module } from '@nestjs/common';
import { ProductExperienceController } from './product-experience.controller';
import { ProductExperienceService } from './product-experience.service';

@Module({
  controllers: [ProductExperienceController],
  providers: [ProductExperienceService],
})
export class ProductExperienceModule {}
