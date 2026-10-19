import { ApiProperty } from '@nestjs/swagger';
import { CertificateAssetKind } from '@prisma/client';
import { IsEnum, IsString, MaxLength } from 'class-validator';

// 2 MB em base64 ocupa ~2,8 M caracteres; o tamanho exacto é validado nos bytes.
const MAX_DATA_URL_CHARS = 3_000_000;

export class UploadAssetDto {
  @ApiProperty({ enum: CertificateAssetKind })
  @IsEnum(CertificateAssetKind)
  kind!: CertificateAssetKind;

  @ApiProperty({ description: 'Imagem PNG ou JPEG como data URL base64 (até 2 MB)' })
  @IsString()
  @MaxLength(MAX_DATA_URL_CHARS)
  file!: string;
}
