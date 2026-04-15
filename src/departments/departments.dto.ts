import {
  IsString, IsOptional, IsInt, IsBoolean,
  IsEnum, IsArray, Min, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Recursos Humanos' })
  @IsString() @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'RH-001' })
  @IsString() @MaxLength(30)
  code!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  parentId?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  headId?: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  color?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  icon?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  costCenter?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  trainingBudget?: number;
}

export class UpdateDepartmentDto extends PartialType(CreateDepartmentDto) {}

export class DepartmentFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean)
  active?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number)
  parentId?: number;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() @Type(() => Boolean)
  rootOnly?: boolean;

  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ default: 30 }) @IsOptional() @IsInt() @Min(1) @Type(() => Number)
  limit?: number;
}

export class TransferMemberDto {
  @ApiProperty() @IsInt()
  userId!: number;

  @ApiProperty() @IsInt()
  targetDepartmentId!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  reason?: string;
}

export class BulkTransferDto {
  @ApiProperty({ type: [Number] })
  @IsArray() @IsInt({ each: true })
  userIds!: number[];

  @ApiProperty() @IsInt()
  targetDepartmentId!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  reason?: string;
}

export class CreateUnitDto {
  @ApiProperty() @IsString() @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'SEDE' }) @IsString()
  tipo!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  province?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  departmentId?: number;

  @ApiProperty() @IsString()
  code!: string;
}

export class UpdateUnitDto extends PartialType(CreateUnitDto) {}

export class CreateDeptRoleDto {
  @ApiProperty({ example: 'GESTOR' }) @IsString() @MaxLength(60)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;
}

export class UpdateDeptRoleDto extends PartialType(CreateDeptRoleDto) {}

export class CreatePermissionDto {
  @ApiProperty({ example: 'read:courses' }) @IsString()
  name!: string;

  @ApiProperty({ example: 'read' }) @IsString()
  action!: string;

  @ApiProperty({ example: 'Course' }) @IsString()
  subject!: string;

  @ApiPropertyOptional() @IsOptional() @IsInt()
  roleId?: number;
}

export class CreatePositionDto {
  @ApiProperty({ example: 'Engenheiro de Software Sénior' })
  @IsString() @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: 'SENIOR' }) @IsOptional() @IsString()
  level?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  department?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  baseSalary?: number;
}

export class UpdatePositionDto extends PartialType(CreatePositionDto) {}

export class CreateCareerPositionDto {
  @ApiProperty() @IsString()
  title!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ example: 'JUNIOR' }) @IsString()
  level!: string;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional() @IsArray()
  competencies?: Array<{ competencyId: number; requiredLevel: number }>;
}
