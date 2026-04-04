import {
  IsString, IsEmail, IsOptional, IsBoolean, IsInt, MinLength,
} from 'class-validator';
import { ApiPropertyOptional, ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateUserDto {
  @ApiProperty() @IsString() fullName!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(6) password!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() roleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() unitId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() positionId?: number;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UpdateProfileDto {
  @ApiProperty() @IsString() bio!: string;
}

export class UserFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) unitId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) departmentId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) roleId?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean) active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}