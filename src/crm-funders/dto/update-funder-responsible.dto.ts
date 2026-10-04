import { IsString, IsOptional, IsInt, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateFunderResponsibleDto {
  @ApiPropertyOptional({ description: 'Gestor do financiador (User.id)' })
  @IsOptional()
  @Type(() => Number)
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

  @ApiPropertyOptional({ description: 'Responsável financeiro (User.id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  financialManagerId?: number;

  @ApiPropertyOptional({ description: 'Responsável técnico (User.id)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  technicalManagerId?: number;
}
