import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PartnerStatus } from '@prisma/client';
import { CreatePartnerDto } from './create-partner.dto';

export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {
  @IsOptional()
  @IsEnum(PartnerStatus)
  status?: PartnerStatus;
}
