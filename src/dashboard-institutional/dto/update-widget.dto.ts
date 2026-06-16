import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { CreateWidgetDto } from './create-widget.dto';

export class UpdateWidgetDto extends PartialType(CreateWidgetDto) {
  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}
