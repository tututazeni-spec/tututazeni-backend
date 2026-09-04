import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsStrongPassword } from '../common/validators/strong-password.decorator';

export class LoginDto {
  @ApiProperty({ example: 'user@empresa.com' })
  @IsEmail({}, { message: 'Email inválido' })
  email!: string;

  @ApiProperty({ example: 'senha123' })
  @IsString()
  @MinLength(6)
  password!: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  fullName!: string;

  @ApiProperty({ example: 'joao@empresa.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @IsStrongPassword()
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  unitId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  departmentId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  positionId?: number;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @IsStrongPassword()
  newPassword!: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 10 })
  @IsString()
  @IsStrongPassword()
  newPassword!: string;
}
