import { ApiProperty } from '@nestjs/swagger';
import { CertificateActivityKind } from '@prisma/client';
import { IsEnum, IsInt, Min } from 'class-validator';

export class IssueCertificateDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  userId!: number;

  @ApiProperty({ enum: CertificateActivityKind })
  @IsEnum(CertificateActivityKind)
  activityKind!: CertificateActivityKind;

  @ApiProperty()
  @IsInt()
  @Min(1)
  activityId!: number;
}
