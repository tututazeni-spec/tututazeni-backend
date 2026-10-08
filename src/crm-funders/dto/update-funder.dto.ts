import { OmitType, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { FunderStatus } from '@prisma/client';
import { CreateFunderDto } from './create-funder.dto';

// Os contactos têm endpoints próprios (:id/contacts) — não se editam via PUT :id
export class UpdateFunderDto extends PartialType(OmitType(CreateFunderDto, ['contacts'] as const)) {
  @IsOptional()
  @IsEnum(FunderStatus)
  status?: FunderStatus;
}
