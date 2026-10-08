import { PartialType } from '@nestjs/swagger';
import { CreateBeneficiaryDto } from './create-beneficiary.dto';

// `status` vive no CreateBeneficiaryDto (opcional) — partilhado por create e update.
export class UpdateBeneficiaryDto extends PartialType(CreateBeneficiaryDto) {}
