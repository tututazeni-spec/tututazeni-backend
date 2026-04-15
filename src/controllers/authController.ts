import { Controller, Post, Body, UnauthorizedException, InternalServerErrorException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import { prisma } from "../lib/prisma";

@Controller("auth")
export class AuthController {
  @Post("login")
  async login(@Body() body: { email: string; password: string }) {
    const { email, password } = body;

    if (!email || !password) {
      throw new UnauthorizedException("E-mail e palavra-passe são obrigatórios");
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException("Credenciais inválidas");
    }

    if (!user.password) {
      throw new UnauthorizedException("Credenciais inválidas");
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      throw new UnauthorizedException("Credenciais inválidas");
    }

    const secret: string = process.env.JWT_SECRET!;
    if (!secret) {
      throw new InternalServerErrorException("Configuração do servidor em falta");
    }

    const payload = { sub: user.id, email: user.email };
    const options: SignOptions = {
      expiresIn: (process.env.JWT_EXPIRES_IN || "15m") as SignOptions["expiresIn"],
    };

    const accessToken = jwt.sign(payload, secret, options);

    return { accessToken };
  }
}