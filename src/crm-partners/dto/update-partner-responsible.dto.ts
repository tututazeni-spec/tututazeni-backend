import { IsString, IsOptional, IsEnum, IsInt, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PartnerRelationshipStatus } from '@prisma/client';

export class UpdatePartnerResponsibleDto {
  @ApiPropertyOptional({ description: 'Gestor do parceiro (User.id)' })
  @IsOptional()
  @IsInt()
  assignedToId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalUnit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalDepartment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  internalTeam?: string;

  @ApiPropertyOptional({ description: 'Por omissão: agora, quando o gestor muda' })
  @IsOptional()
  @IsDateString()
  assignedAt?: string;

  @ApiPropertyOptional({ enum: PartnerRelationshipStatus })
  @IsOptional()
  @IsEnum(PartnerRelationshipStatus)
  relationshipStatus?: PartnerRelationshipStatus;
}
