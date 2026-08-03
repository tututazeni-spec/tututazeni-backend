import { IsString, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';
import { MobileSyncStatus } from '@prisma/client';

export { MobileSyncStatus };

export class RegisterSessionDto {
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  platform!: string;

  @IsOptional()
  @IsString()
  pushToken?: string;
}

export class UpdatePushTokenDto {
  @IsString()
  @IsNotEmpty()
  pushToken!: string;
}

export class LogSyncDto {
  @IsString()
  @IsNotEmpty()
  entity!: string;

  @IsEnum(MobileSyncStatus)
  status!: MobileSyncStatus;
}
