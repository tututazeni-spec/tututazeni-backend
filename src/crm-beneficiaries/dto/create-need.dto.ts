import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NeedPriority } from '@prisma/client';

export class CreateNeedDto {
  @ApiProperty()
  @IsString()
  category: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiPropertyOptional({ enum: NeedPriority, default: 'MEDIUM' })
  @IsOptional()
  @IsEnum(NeedPriority)
  priority?: NeedPriority;
}
