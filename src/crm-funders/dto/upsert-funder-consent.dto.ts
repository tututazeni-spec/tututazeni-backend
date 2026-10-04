import { IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertFunderConsentDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() emailAllowed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() whatsappAllowed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() smsAllowed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() phoneAllowed?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() institutionalComms?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() eventInvites?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() reportComms?: boolean;

  @ApiPropertyOptional({ example: 'Preferência por email, manhãs' })
  @IsOptional()
  @IsString()
  contactPreferences?: string;

  @ApiPropertyOptional({ description: 'Por omissão: agora, se algum consentimento for concedido' })
  @IsOptional()
  @IsDateString()
  consentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
