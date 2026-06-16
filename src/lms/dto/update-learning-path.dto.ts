import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateLearningPathDto } from './create-learning-path.dto';

export class UpdateLearningPathDto extends PartialType(CreateLearningPathDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
