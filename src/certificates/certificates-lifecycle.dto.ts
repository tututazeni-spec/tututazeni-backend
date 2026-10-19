import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
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

export class ReasonDto {
  @ApiProperty({ minLength: 3, maxLength: 500 })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

/** O documento importado é sempre um PDF carregado (data URL) de até 5 MB. */
const MAX_EXTERNAL_BYTES = 5 * 1024 * 1024;

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
  @IsUrlOrInlineFile({ maxBytes: MAX_EXTERNAL_BYTES })
  document!: string;

  @ApiPropertyOptional({ description: 'Já validado por quem importa; senão aguarda validação' })
  @IsOptional()
  @IsBoolean()
  validated?: boolean;
}
