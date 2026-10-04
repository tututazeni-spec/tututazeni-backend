import { IsString, IsOptional, IsDateString, IsEnum, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { FunderReportPeriodicity, FunderReportType, ReportStatus } from '@prisma/client';
import { IsAllowedFileUrl } from '../../common/validators/is-allowed-file-url.validator';

export class CreateFunderReportDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiProperty({ example: 'Q2 2026' })
  @IsString()
  period: string;

  @ApiProperty()
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ enum: FunderReportType, default: 'OTHER' })
  @IsOptional()
  @IsEnum(FunderReportType)
  type?: FunderReportType;

  @ApiPropertyOptional({ enum: FunderReportPeriodicity, default: 'ONE_TIME' })
  @IsOptional()
  @IsEnum(FunderReportPeriodicity)
  periodicity?: FunderReportPeriodicity;

  @ApiPropertyOptional({ description: 'Responsável (User.id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  responsibleId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grantId?: string;

  @ApiPropertyOptional({ description: 'Observações' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateFunderReportDto extends PartialType(CreateFunderReportDto) {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ description: 'Data de submissão' })
  @IsOptional()
  @IsDateString()
  submittedAt?: string;

  @ApiPropertyOptional({ description: 'Documento do relatório' })
  @IsOptional()
  @IsAllowedFileUrl()
  fileUrl?: string;

  @ApiPropertyOptional({ description: 'Parecer do financiador' })
  @IsOptional()
  @IsString()
  feedback?: string;
}

export class FilterFunderReportDto {
  @ApiPropertyOptional({ enum: FunderReportType })
  @IsOptional()
  @IsEnum(FunderReportType)
  type?: FunderReportType;

  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  grantId?: string;
}
