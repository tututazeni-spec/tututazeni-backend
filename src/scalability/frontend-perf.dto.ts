// modulo_scalability.md §10 — amostra de performance enviada pelo browser.

import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class FrontendPerfSampleDto {
  @IsString()
  @MaxLength(200)
  path!: string;

  @IsOptional() @IsNumber() @Min(0) @Max(600_000) ttfbMs?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(600_000) fcpMs?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(600_000) lcpMs?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(600_000) inpMs?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(600_000) loadMs?: number;

  @IsOptional() @IsInt() @Min(0) @Max(2_000_000_000) jsBytes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2_000_000_000) cssBytes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(2_000_000_000) imageBytes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) requests?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100_000) cacheHits?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) errors?: number;
}
