import { OmitType, PartialType } from '@nestjs/swagger';
import { CreatePartnerDto } from './create-partner.dto';

// Contactos são geridos pelos endpoints dedicados /:id/contacts
export class UpdatePartnerDto extends PartialType(
  OmitType(CreatePartnerDto, ['contacts'] as const),
) {}
