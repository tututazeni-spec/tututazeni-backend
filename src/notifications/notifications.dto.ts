import { IsString, IsInt, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateNotificationDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty() @IsString() type!: string;
  @ApiProperty() @IsString() message!: string;
}

export class BulkNotificationDto {
  @ApiProperty({ type: [Number] }) @IsArray() userIds!: number[];
  @ApiProperty() @IsString() type!: string;
  @ApiProperty() @IsString() message!: string;
}

export class NotificationFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() type?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) success?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}