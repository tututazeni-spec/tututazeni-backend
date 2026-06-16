import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RevokeDto {
  @ApiProperty({ example: 'Certificado emitido por engano' })
  @IsString()
  @Length(5, 500)
  reason: string;
}
