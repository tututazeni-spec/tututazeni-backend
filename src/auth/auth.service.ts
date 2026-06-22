import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  LoginDto,
  RegisterDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './auth.dto';

@Injectable()
export class AuthService {
  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): PrismaService {
    return (this.prisma as any).db ?? this.prisma;
  }

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    // Apenas role+permissions — unit/department/position não são necessários
    // para autenticar e custavam 3 queries extra por login. O perfil completo
    // vem de GET /auth/me ou do JwtStrategy nos pedidos seguintes.
    const user = await this.prismaRead.user.findUnique({
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

    const collaboratorRole = await this.prismaRead.role.findFirst({ where: { name: 'COLABORADOR' } });

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
    const { password: _, ...safeUser } = user;
    return { user: safeUser, ...tokens };
  }

  async refreshToken(userId: number, email: string) {
    return this.generateTokens(userId, email);
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.prismaRead.user.findUnique({ where: { id: userId } });
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

  forgotPassword(_dto: ForgotPasswordDto) {
    // Em produção: gerar token, salvar no DB e enviar email
    return { message: 'Se o email existir, receberás instruções de recuperação' };
  }

  resetPassword(_dto: ResetPasswordDto) {
    // Em produção: validar token e atualizar senha
    return { message: 'Senha redefinida com sucesso' };
  }

  async me(userId: number) {
    const user = await this.prismaRead.user.findUnique({
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

  private async generateTokens(userId: number, email: string) {
    const payload = { sub: userId, email };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, { expiresIn: '15m' }),
      this.jwtService.signAsync(payload, {
        expiresIn: '7d',
        secret: process.env.JWT_REFRESH_SECRET || 'refresh-secret',
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
