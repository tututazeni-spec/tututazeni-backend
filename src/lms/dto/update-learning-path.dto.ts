import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { LmsCreateLearningPathDto } from './create-learning-path.dto';

export class LmsUpdateLearningPathDto extends PartialType(LmsCreateLearningPathDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
