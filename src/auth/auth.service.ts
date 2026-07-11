import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto, ChangePasswordDto } from './auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    // Apenas role+permissions — unit/department/position não são necessários
    // para autenticar e custavam 3 queries extra por login. O perfil completo
    // vem de GET /auth/me ou do JwtStrategy nos pedidos seguintes.
    // NOTA: lê do PRIMARY (this.prisma), nunca da réplica — a validação de
    // credenciais tem de ver sempre a password mais recente (read-after-write).
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        role: { include: { permissions: true } },
      },
    });

    if (!user) throw new UnauthorizedException('Credenciais inválidas');
    if (!user.active) throw new UnauthorizedException('Conta desativada');

    if (!user.password) throw new UnauthorizedException('Credenciais inválidas');
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Credenciais inválidas');

    const tokens = await this.generateTokens(user.id, user.email);
    await this.persistRefreshToken(user.id, tokens.refreshToken);

    // fire-and-forget — não bloqueia a resposta de login
    this.prisma.auditLog
      .create({ data: { userId: user.id, action: 'LOGIN', entity: 'User', entityId: user.id } })
      .catch(() => undefined);

    const { password: _, ...safeUser } = user;
    return { user: safeUser, ...tokens };
  }

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email já registado');

    const hashed = await bcrypt.hash(dto.password, 12);

    const collaboratorRole = await this.prisma.read.role.findFirst({
      where: { name: 'COLABORADOR' },
    });

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        password: hashed,
        unitId: dto.unitId,
        departmentId: dto.departmentId,
        positionId: dto.positionId,
        roleId: collaboratorRole?.id,
      },
      include: { role: true, unit: true, department: true },
    });

    await this.prisma.userPoints.create({ data: { userId: user.id, points: 0 } });

    const tokens = await this.generateTokens(user.id, user.email);
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    const { password: _, ...safeUser } = user;
    return { user: safeUser, ...tokens };
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    // PRIMARY: comparamos a password atual antes de escrever a nova; a réplica
    // poderia devolver um hash desatualizado durante o replication lag.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    if (!user.password) throw new UnauthorizedException('Sem password definida');
    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Senha atual incorreta');

    const hashed = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });

    await this.prisma.auditLog.create({
      data: { userId, action: 'CHANGE_PASSWORD', entity: 'User', entityId: userId },
    });

    return { message: 'Senha alterada com sucesso' };
  }

  async me(userId: number) {
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: true } },
        unit: true,
        department: true,
        position: true,
        profile: true,
        points: true,
        badgeAwards: { include: { badge: true }, take: 5, orderBy: { awardedAt: 'desc' } },
      },
    });
    if (!user) throw new UnauthorizedException();
    const { password: _, ...safeUser } = user;
    return safeUser;
  }

  private async persistRefreshToken(userId: number, refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }

  async rotateRefreshToken(userId: number, email: string, presented: string) {
    const hash = crypto.createHash('sha256').update(presented).digest('hex');
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });

    // Token desconhecido => possível reutilização de token roubado.
    // Sem registo não temos userId armazenado, usamos o userId do payload.
    if (!record) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Finding 2: userId autoritativo vem do registo, não do payload.
    // Se diferirem é sinal de adulteração — revoga a cadeia do dono real.
    const authorizedUserId = record.userId;
    if (authorizedUserId !== userId) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: authorizedUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token inválido');
    }

    // Token já revogado => reutilização detectada, revoga a cadeia completa.
    if (record.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: authorizedUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token inválido');
    }

    if (record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expirado');
    }

    // Finding 1: revogação atómica e condicional — apenas revoga se ainda não
    // foi revogado. Se count === 0, outra requisição ganhou a corrida (double-spend).
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (count === 0) {
      // Corrida de reutilização: outra requisição já revogou este token.
      await this.prisma.refreshToken.updateMany({
        where: { userId: authorizedUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token inválido');
    }

    const tokens = await this.generateTokens(authorizedUserId, email);
    await this.persistRefreshToken(authorizedUserId, tokens.refreshToken);
    return tokens;
  }

  async revokeRefreshToken(presented: string): Promise<void> {
    const hash = crypto.createHash('sha256').update(presented).digest('hex');
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async generateTokens(userId: number, email: string) {
    // Segredo do refresh obrigatório: sem fallback inseguro. Um valor por defeito
    // conhecido (ex.: 'refresh-secret') permitiria forjar refresh tokens válidos.
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret) {
      throw new Error(
        'JWT_REFRESH_SECRET não está definido — recusado por segurança. Configure a variável de ambiente.',
      );
    }

    const payload = { sub: userId, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { expiresIn: '15m' }),
      this.jwtService.signAsync(payload, {
        expiresIn: '7d',
        secret: refreshSecret,
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
