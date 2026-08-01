import { IsString, IsOptional, IsIn, IsNotEmpty } from 'class-validator';

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

  @IsIn(['SUCCESS', 'FAILED'])
  status!: 'SUCCESS' | 'FAILED';
}
