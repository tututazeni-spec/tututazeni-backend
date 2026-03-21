import { IsEmail, IsString, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name!: string; // corrigido: adicionando "!"

  @IsEmail()
  email!: string; // corrigido: adicionando "!"

  @IsString()
  @MinLength(6)
  password!: string; // adicionei "!" para consistência e validação
}

