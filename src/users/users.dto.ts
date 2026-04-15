import {
  IsString, IsEmail, IsOptional, IsBoolean, IsInt, IsEnum,
  IsArray, MinLength, MaxLength, IsDateString, Min, Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum AccountStatus {
  ACTIVE    = 'ACTIVE',
  INACTIVE  = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  BLOCKED   = 'BLOCKED',
  PENDING   = 'PENDING',
}

export enum HrStatus {
  ACTIVE     = 'ACTIVE',
  ON_LEAVE   = 'ON_LEAVE',
  TERMINATED = 'TERMINATED',
}

export enum Gender {
  MALE   = 'MALE',
  FEMALE = 'FEMALE',
  OTHER  = 'OTHER',
}

export class CreateUserDto {
  @ApiProperty({ example: 'Manuel Afonso Neto' })
  @IsString() @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: 'manuel@innova.ao' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional() @IsString() @MinLength(8)
  password?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  employeeNumber?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ enum: Gender }) @IsOptional() @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional() @IsOptional() @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ default: 'pt' }) @IsOptional() @IsString()
  language?: string;

  @ApiPropertyOptional({ example: 'Africa/Luanda' }) @IsOptional() @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'Angola' }) @IsOptional() @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'Luanda' }) @IsOptional() @IsString()
  city?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  departmentId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  positionId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  unitId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  managerId?: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  exitDate?: string;

  @ApiPropertyOptional({ enum: HrStatus, default: HrStatus.ACTIVE })
  @IsOptional() @IsEnum(HrStatus)
  hrStatus?: HrStatus;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  roleId?: number;

  @ApiPropertyOptional({ enum: AccountStatus, default: AccountStatus.PENDING })
  @IsOptional() @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UpdateProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000)
  bio?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString()
  careerGoals?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  linkedinUrl?: string;
}

export class UserFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  positionId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  unitId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  managerId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  roleId?: number;

  @ApiPropertyOptional({ enum: AccountStatus }) @IsOptional() @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;

  @ApiPropertyOptional({ enum: HrStatus }) @IsOptional() @IsEnum(HrStatus)
  hrStatus?: HrStatus;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean)
  active?: boolean;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 20 }) @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number)
  limit?: number;
}

export class BulkActionDto {
  @ApiProperty({ type: [Number] })
  @IsArray() @IsInt({ each: true })
  userIds!: number[];

  @ApiProperty({ enum: ['activate', 'deactivate', 'suspend', 'assign_course'] })
  @IsString()
  action!: 'activate' | 'deactivate' | 'suspend' | 'assign_course';

  @ApiPropertyOptional() @IsOptional() @IsInt()
  courseId?: number;
}

export class InviteUserDto {
  @ApiProperty() @IsEmail()
  email!: string;

  @ApiProperty() @IsString()
  fullName!: string;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  roleId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  departmentId?: number;
}

export class UserChangePasswordDto {
  @ApiProperty() @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 8 }) @IsString() @MinLength(8)
  newPassword!: string;
}
