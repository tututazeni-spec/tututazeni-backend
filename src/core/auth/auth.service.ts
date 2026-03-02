import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto, LoginDto } from './dto/auth.dto';

type JwtPayload = {
  sub: string;
  role: string; // agora é string (nome da role)
};

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new UnauthorizedException('E-mail já registado');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // 🔥 Buscar role dinamicamente
    const role = await this.prisma.role.findUnique({
      where: { name: 'COLABORADOR' },
    });

    if (!role) {
      throw new UnauthorizedException('Role COLABORADOR não encontrada');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: passwordHash,
        fullName: dto.fullName,
        role: {
          connect: { id: role.id },
        },
      },
      include: {
        role: true,
      },
    });

    const tokens = await this.generateTokens(
      user.id.toString(),
      user.role?.name ?? '',
    );

    return {
      user,
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { role: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const valid = await bcrypt.compare(dto.password, user.password);

    if (!valid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const tokens = await this.generateTokens(
      user.id.toString(),
      user.role?.name ?? '',
    );

    return {
      user,
      ...tokens,
    };
  }

  async generateTokens(userId: string, role: string) {
    const payload: JwtPayload = {
      sub: userId,
      role,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET ?? 'access-secret',
      expiresIn: '1h',
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET ?? 'refresh-secret',
      expiresIn: '7d',
    });

    return {
      accessToken,
      refreshToken,
    };
  }
}