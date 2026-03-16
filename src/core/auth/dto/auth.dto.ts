import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  fullName!: string; // corrigido: adicionando o "!" para evitar TS2564
}

export class LoginDto {
  @IsEmail()
  email!: string; // corrigido: adicionando "!"

  @IsString()
  @MinLength(6)
  password!: string; // corrigido: adicionando "!"
}

