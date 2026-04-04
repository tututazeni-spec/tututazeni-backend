import { IsInt, IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum LeaveType {
  FERIAS = 'FERIAS',
  DOENCA = 'DOENCA',
  MATERNIDADE = 'MATERNIDADE',
  PATERNIDADE = 'PATERNIDADE',
  LUTO = 'LUTO',
  CASAMENTO = 'CASAMENTO',
  ESTUDO = 'ESTUDO',
  JUSTIFICADA = 'JUSTIFICADA',
  NAO_JUSTIFICADA = 'NAO_JUSTIFICADA',
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export class CreateLeaveRequestDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiProperty({ enum: LeaveType }) @IsEnum(LeaveType) type!: LeaveType;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() documentUrl?: string;
}
export class UpdateLeaveRequestDto extends PartialType(CreateLeaveRequestDto) {}

export class ApproveLeaveDto {
  @ApiProperty({ enum: LeaveStatus }) @IsEnum(LeaveStatus) status!: LeaveStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() approverNote?: string;
}

export class LeaveFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) userId?: number;
  @ApiPropertyOptional() @IsOptional() @IsEnum(LeaveType) type?: LeaveType;
  @ApiPropertyOptional() @IsOptional() @IsEnum(LeaveStatus) status?: LeaveStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() to?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}