import { IsString, IsOptional, IsInt, IsPositive, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class StartAiSessionDto {
  @ApiPropertyOptional({ description: 'ID do curso (opcional — para tutor contextualizado)' })
  @IsOptional() @IsInt() courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() enrollmentId?: number;
}

export class SendAiMessageDto {
  @ApiProperty({ description: 'ID da sessão iniciada em POST /ai-tutor/sessions' })
  @IsInt() sessionId!: number;
  @ApiProperty({ example: 'Qual a diferença entre crédito pessoal e crédito habitação?' })
  @IsString() message!: string;
  @ApiPropertyOptional({ description: 'Máximo de tokens na resposta (padrão: 1024)', default: 1024 })
  @IsOptional() @IsInt() @IsPositive() @Max(4096) maxTokens?: number;
}

export class AiSessionFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) courseId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}