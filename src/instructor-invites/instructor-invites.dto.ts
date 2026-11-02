import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateInstructorInviteDto {
  @ApiProperty({ example: 'formador@externo.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Ana Formadora' })
  @IsString()
  @MinLength(2)
  fullName!: string;

  @ApiPropertyOptional({ default: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  accessDays?: number;
}

export class ExtendAccessDto {
  @ApiProperty({ minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  accessDays!: number;
}

export class AcceptInstructorInviteDto {
  @ApiProperty()
  @IsString()
  @MinLength(32)
  token!: string;

  @ApiProperty({ minLength: 6, maxLength: 128 })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({
    description: 'Identificador do dispositivo (UUID v4 guardado no browser)',
  })
  @IsOptional()
  @IsUUID(4)
  deviceId?: string;
}
