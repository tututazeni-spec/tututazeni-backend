// modulo_scalability.md §15-17 — DTOs das abas Capacidade, Auto Scaling e Resiliência.

import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpdateCapacityLimitsDto {
  @IsOptional() @IsInt() @Min(1) @Max(10_000_000) maxConcurrentUsers?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) maxApiRps?: number;
}

export class ScheduledScalingDto {
  @IsString() @MaxLength(80) name!: string;
  @IsString() @MaxLength(60) cron!: string;
  @IsInt() @Min(1) @Max(200) minInstances!: number;
  @IsInt() @Min(1) @Max(200) maxInstances!: number;
}

export class UpdateAutoScalingDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(200) minInstances?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) maxInstances?: number;
  @IsOptional() @IsInt() @Min(10) @Max(95) targetCpu?: number;
  @IsOptional() @IsInt() @Min(10) @Max(95) targetMemory?: number;
  @IsOptional() @IsInt() @Min(1) @Max(100_000) requestsPerInstance?: number;
  @IsOptional() @IsInt() @Min(10) @Max(100) scaleUpThreshold?: number;
  @IsOptional() @IsInt() @Min(1) @Max(240) scaleUpMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(90) scaleDownThreshold?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1440) scaleDownMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1440) cooldownMinutes?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduledScalingDto)
  scheduled?: ScheduledScalingDto[];
  @IsOptional() @IsBoolean() emergencyEnabled?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(500) emergencyMaxInstances?: number;
}

export class UpdateResilienceDto {
  @IsOptional() @IsInt() @Min(1) @Max(525_600) rpoMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(525_600) rtoMinutes?: number;
  @IsOptional() @IsInt() @Min(1) @Max(200) apiReplicas?: number;
  @IsOptional() @IsBoolean() dbReplication?: boolean;
  @IsOptional() @IsBoolean() failoverEnabled?: boolean;
  @IsOptional() @IsBoolean() loadBalancer?: boolean;
  @IsOptional() @IsBoolean() cdnEnabled?: boolean;
  @IsOptional() @IsBoolean() drPlanDocumented?: boolean;
  @IsOptional() @IsDateString() lastBackupAt?: string;
  @IsOptional() @IsDateString() lastRecoveryTestAt?: string;
  @IsOptional() @IsBoolean() lastRecoveryTestOk?: boolean;
}
