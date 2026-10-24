import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CertificateActivityKind } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsUrlOrInlineFile } from '../common/validators/is-url-or-inline-file.decorator';
import { FILE_POLICIES } from '../common/files/file-policies';

export class ReasonDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class ImportExternalCertificateDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  userId!: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  issuerName!: string;

  @ApiProperty()
  @IsDateString()
  completedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000)
  hours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  @ApiProperty({ description: 'PDF carregado como data URL base64 (até 5 MB)' })
  @Matches(/^data:application\/pdf;base64,/, { message: 'o documento tem de ser um PDF carregado' })
  @IsUrlOrInlineFile({ policy: FILE_POLICIES.PDF })
  document!: string;

  @ApiPropertyOptional({ description: 'Já validado por quem importa; senão aguarda validação' })
  @IsOptional()
  @IsBoolean()
  validated?: boolean;
}

export const MAX_BATCH_SIZE = 500;

export class BatchIssueDto {
  @ApiProperty({ enum: CertificateActivityKind })
  @IsEnum(CertificateActivityKind)
  activityKind!: CertificateActivityKind;

  @ApiProperty()
  @IsInt()
  @Min(1)
  activityId!: number;

  @ApiPropertyOptional({ description: 'Titulares a certificar (1–500, sem repetidos)' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_BATCH_SIZE)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  userIds?: number[];

  @ApiPropertyOptional({
    description: 'Todos os que concluíram (cursos) ou estiveram presentes (eventos)',
  })
  @IsOptional()
  @IsBoolean()
  allEligible?: boolean;
}
