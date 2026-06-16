import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { FunderStatus } from '@prisma/client';
import { CreateFunderDto } from './create-funder.dto';

export class UpdateFunderDto extends PartialType(CreateFunderDto) {
  @IsOptional()
  @IsEnum(FunderStatus)
  status?: FunderStatus;
}
