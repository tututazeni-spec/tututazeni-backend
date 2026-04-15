import { IsString, IsInt, IsOptional, IsDateString, IsNumber, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateEmployeeDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() role!: string;
  @ApiProperty() @IsDateString() joinedAt!: string;
}

export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

export class CreateContractDto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiProperty() @IsString() status!: string;
}

export class CreateEmployeeAttendanceDto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsDateString() date!: string;
  @ApiProperty() @IsNumber() hoursWorked!: number;
  @ApiProperty() @IsString() status!: string;
}

export class CreateFeedback360Dto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsString() evaluatorName!: string;
  @ApiProperty() @IsString() evaluatorRole!: string;
  @ApiProperty() @IsNumber() score!: number;
  @ApiProperty() @IsString() comments!: string;
  @ApiProperty() @IsDateString() evaluatedAt!: string;
}

export class CreateEmployeeCareerPlanDto {
  @ApiProperty() @IsInt() employeeId!: number;
  @ApiProperty() @IsString() title!: string;
  @ApiProperty() @IsString() description!: string;
  @ApiProperty() @IsDateString() startDate!: string;
  @ApiProperty() @IsDateString() endDate!: string;
  @ApiProperty() @IsString() status!: string;
}

export class EmployeeFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() role?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}