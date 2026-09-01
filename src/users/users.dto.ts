import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsInt,
  IsEnum,
  IsArray,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsStrongPassword } from '../common/validators/strong-password.decorator';
import { IsBase64ImageDataUrl } from '../common/validators/is-base64-image-data-url.decorator';
import { EmptyStringToUndefined } from '../common/transformers/empty-string-to-undefined';
import { AccountStatus, HrStatus } from '@prisma/client';
import { BaseFilterDto } from '../common/dtos/pagination.dto';

export { AccountStatus, HrStatus };

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export class CreateUserDto {
  @ApiProperty({ example: 'Manuel Afonso Neto' })
  @IsString()
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ example: 'manuel@innova.ao' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ minLength: 10 })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @IsStrongPassword()
  password?: string;

  // `String? @unique` no schema: um "" enviado por formulário/import grava na
  // BD e o 2.º utilizador sem nº de funcionário rebenta com P2002 (500).
  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(30)
  employeeNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  avatarUrl?: string;

  @ApiPropertyOptional({ default: 'pt' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ example: 'Africa/Luanda' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'Angola' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'Luanda' })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  positionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  unitId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  managerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsDateString()
  hireDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @EmptyStringToUndefined()
  @IsDateString()
  exitDate?: string;

  @ApiPropertyOptional({ enum: HrStatus, default: HrStatus.ACTIVE })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsEnum(HrStatus)
  hrStatus?: HrStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  roleId?: number;

  @ApiPropertyOptional({ enum: AccountStatus, default: AccountStatus.PENDING })
  @IsOptional()
  @EmptyStringToUndefined()
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  bio?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  careerGoals?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkedinUrl?: string;
}

export class UpdateMyAvatarDto {
  @ApiProperty({
    description: 'Foto de perfil como data URL base64 (png, jpeg ou webp)',
    example: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...',
  })
  @IsString()
  @MaxLength(200_000) // ~150 KB descodificados — válvula de segurança; espelha o frontend
  @IsBase64ImageDataUrl()
  avatarUrl!: string;
}

export class UserFilterDto extends BaseFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  positionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  unitId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  managerId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  roleId?: number;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  accountStatus?: AccountStatus;

  @ApiPropertyOptional({ enum: HrStatus })
  @IsOptional()
  @IsEnum(HrStatus)
  hrStatus?: HrStatus;

  // @Type(() => Boolean) coage '?active=false' para true — ver
  // [[project-innova-boolean-query-filter-coercion]]. @Type(() => String) +
  // @Transform evita a coerção Boolean automática do class-transformer.
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => String)
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  active?: boolean;
}

export class BulkActionDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  userIds!: number[];

  @ApiProperty({ enum: ['activate', 'deactivate', 'suspend', 'assign_course'] })
  @IsString()
  action!: 'activate' | 'deactivate' | 'suspend' | 'assign_course';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  courseId?: number;
}

export class InviteUserDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  fullName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  roleId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  departmentId?: number;
}

export class UserChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @IsStrongPassword()
  newPassword!: string;
}
