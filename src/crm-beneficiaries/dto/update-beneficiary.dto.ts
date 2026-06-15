import { PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { BeneficiaryStatus } from '@prisma/client';
import { CreateBeneficiaryDto } from './create-beneficiary.dto';

export class UpdateBeneficiaryDto extends PartialType(CreateBeneficiaryDto) {
  @IsOptional()
  @IsEnum(BeneficiaryStatus)
  status?: BeneficiaryStatus;
}
