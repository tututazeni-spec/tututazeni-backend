import { IsString, IsOptional, IsEmail, IsBoolean, IsEnum, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { FunderContactRole } from '@prisma/client';

export class CreateFunderContactDto {
  @ApiProperty({ example: 'João' })
  @IsString()
  @Length(1, 100)
  firstName: string;

  @ApiPropertyOptional({ example: 'Silva' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'Director' })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({ example: 'Programas' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional({ example: 'EMAIL' })
  @IsOptional()
  @IsString()
  preferredChannel?: string;

  @ApiPropertyOptional({ enum: FunderContactRole })
  @IsOptional()
  @IsEnum(FunderContactRole)
  role?: FunderContactRole;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateFunderContactDto extends PartialType(CreateFunderContactDto) {}
