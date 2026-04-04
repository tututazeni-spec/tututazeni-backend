import { IsString, IsOptional, IsInt, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateKnowledgeCategoryDto {
  @ApiProperty() @IsString() name!: string;
}

export class CreateKnowledgeArticleDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty() @IsString() content!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() categoryId?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() tags?: string[];
}
export class UpdateKnowledgeArticleDto extends PartialType(CreateKnowledgeArticleDto) {}

export class KnowledgeFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) categoryId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) authorId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) page?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Type(() => Number) limit?: number;
}

export class KnowledgeInteractionDto {
  @ApiProperty() @IsInt() articleId!: number;
  @ApiProperty() @IsString() action!: string; // 'VIEW' | 'LIKE' | 'BOOKMARK' | 'SHARE'
}