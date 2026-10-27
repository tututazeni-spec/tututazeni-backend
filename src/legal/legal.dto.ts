import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsString, MaxLength, ValidateNested } from 'class-validator';
import { LEGAL_DOC_TYPES, LegalDocType } from './legal.versions';

export class AcceptedDocumentDto {
  @ApiProperty({ enum: LEGAL_DOC_TYPES }) @IsIn(LEGAL_DOC_TYPES) type!: LegalDocType;
  @ApiProperty() @IsString() @MaxLength(20) version!: string;
}

export class AcceptLegalDto {
  @ApiProperty({ type: [AcceptedDocumentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AcceptedDocumentDto)
  documents!: AcceptedDocumentDto[];
}
