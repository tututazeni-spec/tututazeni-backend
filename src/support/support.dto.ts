import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  SupportCategory,
  SupportPriority,
  SupportStatus,
} from './support.sla';

export class CreateTicketDto {
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(150) subject!: string;
  @ApiProperty() @IsString() @MinLength(10) @MaxLength(5000) description!: string;
  @ApiProperty({ enum: SUPPORT_CATEGORIES }) @IsIn(SUPPORT_CATEGORIES) category!: SupportCategory;
  @ApiProperty({ enum: SUPPORT_PRIORITIES }) @IsIn(SUPPORT_PRIORITIES) priority!: SupportPriority;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300) page?: string;
}

export class ReplyTicketDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(5000) body!: string;
  /** Só pessoal de suporte: nota interna invisível ao pedinte. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() internal?: boolean;
}

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: SUPPORT_STATUSES }) @IsIn(SUPPORT_STATUSES) status!: SupportStatus;
}

export class TicketQueryDto {
  @ApiPropertyOptional({ enum: SUPPORT_STATUSES })
  @IsOptional()
  @IsIn(SUPPORT_STATUSES)
  status?: SupportStatus;
  @ApiPropertyOptional({ enum: SUPPORT_PRIORITIES })
  @IsOptional()
  @IsIn(SUPPORT_PRIORITIES)
  priority?: SupportPriority;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) page: number = 1;
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 25;
}
