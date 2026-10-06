import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { SecuritySettingsService } from '../settings/security-settings.service';
import { isPasswordExpired, isTwoFactorRequired } from '../settings/security-policy';
import { verifyTotp } from '../settings/totp';
import { decryptSecret } from '../automation/automation-connections.service';
import { LoginDto, RegisterDto, ChangePasswordDto } from './auth.dto';
import { BCRYPT_COST_FACTOR } from '../common/config/security.config';
import { withFlatPermissions } from '../common/utils/role-permissions';
import { writeChainedAuditLog } from '../common/helpers/audit-chain';

// A10-24: um refresh token não usado há mais tempo do que isto é tratado
// como sessão inactiva — a cadeia é revogada mesmo que o token em si ainda
// não tenha expirado. 25 min por omissão (requisito de produto: sessão
// expira ao fim de 25 min de inactividade do utilizador); configurável via
// env. O frontend renova o access token em segundo plano enquanto houver
// actividade (rato/teclado/toque) dentro desta janela — ver
// frontend/lib/sessionActivity.ts.
// Contexto de rede do pedido, registado nos eventos de auditoria de acesso
// (docs/modulo_audit.md §6). Opcional: chamadores internos/testes omitem-no.
export interface AuthRequestContext {
  ip?: string;
  userAgent?: string;
}

export function sessionIdleTimeoutMs(
  env: string | undefined = process.env.SESSION_IDLE_TIMEOUT_MS,
): number {
  const parsed = env ? Number(env) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1_500_000;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    // Optional: specs sem SettingsModule continuam a montar o serviço.
    @Optional() private readonly settings?: SettingsService,
    @Optional() private readonly security?: SecuritySettingsService,
  ) {}

  /**
   * Regista um evento de acesso em AuditLog sem nunca afectar o fluxo de
   * autenticação (fire-and-forget). Nunca recebe nem grava palavras-passe.
   */
  private recordAccessEvent(data: {
    userId?: number | null;
    action: string;
    entity: string;
    entityId?: number;
    status?: 'SUCCESS' | 'FAILED' | 'DENIED';
    severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    ctx?: AuthRequestContext;
    metadata?: Record<string, unknown>;
  }): void {
    Promise.resolve()
      .then(() =>
        writeChainedAuditLog(this.prisma, {
          userId: data.userId ?? null,
          action: data.action,
          entity: data.entity,
          entityId: data.entityId,
          status: data.status,
          severity: data.severity,
          ip: data.ctx?.ip,
          userAgent: data.ctx?.userAgent?.slice(0, 300),
          metadata: data.metadata ? JSON.stringify(data.metadata) : undefined,
        }),
      )
      .catch((err: unknown) =>
        this.logger.warn({
          userId: data.userId,
          action: data.action,
          err: { message: err instanceof Error ? err.message : String(err) },
          msg: 'Falha ao registar evento de acesso em AuditLog',
        }),
      );
  }

  private failedLogin(
    reason: 'UNKNOWN_USER' | 'ACCOUNT_DISABLED' | 'BAD_PASSWORD' | 'NO_PASSWORD',
    email: string,
    userId: number | null,
    ctx?: AuthRequestContext,
  ): UnauthorizedException {
    this.recordAccessEvent({
      userId,
      action: 'FAILED',
      entity: 'Auth',
      entityId: userId ?? undefined,
      status: 'FAILED',
      severity: reason === 'BAD_PASSWORD' || reason === 'UNKNOWN_USER' ? 'MEDIUM' : 'LOW',
      ctx,
      metadata: { reason, email },
    });
    return new UnauthorizedException(
      reason === 'ACCOUNT_DISABLED' ? 'Conta desativada' : 'Credenciais inválidas',
    );
  }

  async login(dto: LoginDto, ctx?: AuthRequestContext) {
    // Apenas role+permissions — unit/department/position não são necessários
    // para autenticar e custavam 3 queries extra por login. O perfil completo
    // vem de GET /auth/me ou do JwtStrategy nos pedidos seguintes.
    // NOTA: lê do PRIMARY (this.prisma), nunca da réplica — a validação de
    // credenciais tem de ver sempre a password mais recente (read-after-write).
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
      },
      // password é omitido por omissão (src/prisma/prisma.service.ts) — precisamos
      // dele aqui para o bcrypt.compare abaixo.
      // twoFactorSecret também é omitido por omissão — preciso dele para validar o TOTP.
      omit: { password: false, twoFactorSecret: false },
    });

    if (!user) throw this.failedLogin('UNKNOWN_USER', dto.email, null, ctx);
    if (!user.active) throw this.failedLogin('ACCOUNT_DISABLED', dto.email, user.id, ctx);

    // Definições §4: conta bloqueada por tentativas falhadas (antes do bcrypt —
    // poupa CPU e impede força bruta durante o bloqueio).
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
      this.recordAccessEvent({
        userId: user.id,
        action: 'FAILED',
        entity: 'Auth',
        entityId: user.id,
        status: 'DENIED',
        severity: 'MEDIUM',
        ctx,
        metadata: { reason: 'ACCOUNT_LOCKED', email: dto.email },
      });
      throw new UnauthorizedException(
        `Conta bloqueada temporariamente por tentativas falhadas. Tente novamente dentro de ${minutes} min`,
      );
    }

    if (!user.password) throw this.failedLogin('NO_PASSWORD', dto.email, user.id, ctx);
    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      const lockedUntil = await this.security?.registerFailedAttempt(user.id).catch(() => null);
      const err = this.failedLogin('BAD_PASSWORD', dto.email, user.id, ctx);
      if (lockedUntil) {
        throw new UnauthorizedException(
          'Demasiadas tentativas falhadas — conta bloqueada temporariamente',
        );
      }
      throw err;
    }

    // Definições §4: 2FA (TOTP). Sem código → o cliente pede-o e repete o login.
    if (user.twoFactorEnabled && user.twoFactorSecret) {
      if (!dto.totpCode) {
        throw new UnauthorizedException({
          message: 'Código de autenticação de dois factores necessário',
          code: 'TWO_FACTOR_REQUIRED',
        });
      }
      if (!verifyTotp(decryptSecret(user.twoFactorSecret), dto.totpCode)) {
        await this.security?.registerFailedAttempt(user.id).catch(() => null);
        throw this.failedLogin('BAD_PASSWORD', dto.email, user.id, ctx);
      }
    }
    await this.security?.clearFailedAttempts(user.id, user.failedLoginAttempts);

    const securityPolicy = await this.security?.getPolicy();

    // Política de utilizadores (Definições §3): convites expiram e a password
    // temporária tem de ser trocada. Só se aplica a contas criadas por convite
    // (PENDING + INVITE_SENT) que ainda nunca trocaram a password.
    let mustChangePassword = false;
    if (this.settings && user.accountStatus === 'PENDING' && !user.passwordChangedAt) {
      const invited = await this.prisma.notificationLog.findFirst({
        where: { userId: user.id, type: 'INVITE_SENT' },
        select: { id: true },
      });
      if (invited) {
        const policy = await this.settings.getUserPolicy();
        const expiresAt = user.createdAt.getTime() + policy.invitationExpiryDays * 86_400_000;
        if (Date.now() > expiresAt) {
          throw new UnauthorizedException(
            'Convite expirado — peça um novo convite ao administrador',
          );
        }
        mustChangePassword = policy.forcePasswordChangeOnFirstLogin;
      }
    }

    // Definições §4: palavra-passe expirada obriga a trocar (mesmo fluxo da password temporária).
    if (
      securityPolicy &&
      isPasswordExpired(securityPolicy, user.passwordChangedAt, user.createdAt)
    ) {
      mustChangePassword = true;
    }
    // 2FA obrigatório pela organização mas ainda não configurado → o cliente guia a configuração.
    const twoFactorSetupRequired =
      !!securityPolicy &&
      !user.twoFactorEnabled &&
      isTwoFactorRequired(securityPolicy, user.role?.name === 'ADMIN' || user.role?.name === 'RH');

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      securityPolicy?.accessTokenMinutes,
    );
    await this.persistRefreshToken(
      user.id,
      tokens.refreshToken,
      ctx,
      securityPolicy?.refreshTokenDays,
    );

    // fire-and-forget — não bloqueia a resposta de login
    writeChainedAuditLog(this.prisma, {
      userId: user.id,
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent?.slice(0, 300),
    }).catch((err: unknown) =>
      this.logger.warn({
        userId: user.id,
        action: 'LOGIN',
        entity: 'User',
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao registar audit log de login',
      }),
    );

    // Também na UserAuditLog — é essa tabela que alimenta o separador
    // "Histórico & Auditoria" do módulo Users (docs/modulo_users.md Ponto 6,
    // que pede explicitamente Login/Logout na lista de eventos).
    this.prisma.userAuditLog
      .create({ data: { userId: user.id, performedById: user.id, action: 'LOGIN' } })
      .catch((err: unknown) =>
        this.logger.warn({
          userId: user.id,
          action: 'LOGIN',
          err: { message: err instanceof Error ? err.message : String(err) },
          msg: 'Falha ao registar UserAuditLog de login',
        }),
      );

    const { password: _, twoFactorSecret: __, ...rest } = user;
    const safeUser = { ...rest, role: withFlatPermissions(user.role) };
    return { user: safeUser, ...tokens, mustChangePassword, twoFactorSetupRequired };
  }

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email já registado');

    await this.security?.assertPasswordAllowed(dto.password);
    const hashed = await bcrypt.hash(dto.password, BCRYPT_COST_FACTOR);

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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      omit: { password: false },
    });
    if (!user) throw new UnauthorizedException();

    if (!user.password) throw new UnauthorizedException('Sem password definida');
    const valid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!valid) throw new BadRequestException('Senha atual incorreta');

    await this.security?.assertPasswordAllowed(dto.newPassword);
    const hashed = await bcrypt.hash(dto.newPassword, BCRYPT_COST_FACTOR);
    const now = new Date();

    // Mudar a senha invalida todas as sessões activas (incluindo a actual) —
    // um token roubado antes da troca deixa de servir. O próprio JwtStrategy
    // já rejeita accessTokens emitidos antes de passwordChangedAt.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        // Primeira troca de password de uma conta convidada activa-a.
        data: {
          password: hashed,
          passwordChangedAt: now,
          ...(user.accountStatus === 'PENDING' && { accountStatus: 'ACTIVE' as const }),
        },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);

    await writeChainedAuditLog(this.prisma, {
      userId,
      action: 'CHANGE_PASSWORD',
      entity: 'User',
      entityId: userId,
      severity: 'MEDIUM',
    });

    return { message: 'Senha alterada com sucesso. Sessão terminada, inicia sessão novamente.' };
  }

  async me(userId: number) {
    const user = await this.prisma.read.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
        unit: true,
        department: true,
        position: true,
        profile: true,
        points: true,
        badgeAwards: { include: { badge: true }, take: 5, orderBy: { awardedAt: 'desc' } },
      },
    });
    if (!user) throw new UnauthorizedException();
    const { password: _, ...rest } = user;
    return { ...rest, role: withFlatPermissions(user.role) };
  }

  private async persistRefreshToken(
    userId: number,
    refreshToken: string,
    ctx?: AuthRequestContext,
    refreshDays = 7,
  ): Promise<void> {
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: crypto.createHash('sha256').update(refreshToken).digest('hex'),
        expiresAt: new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000),
        // Sessões activas (Definições §4): de onde veio esta sessão.
        ip: ctx?.ip,
        userAgent: ctx?.userAgent?.slice(0, 300),
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

    // A10-24: cada rotação cria um registo novo (persistRefreshToken), por
    // isso o createdAt deste registo já é "quando foi a última actividade"
    // — não precisa de campo extra. Se ninguém veio renovar a sessão dentro
    // da janela de inactividade, a cadeia inteira morre aqui.
    const policy = await this.security?.getPolicy();
    const idleLimitMs = policy ? policy.sessionIdleMinutes * 60_000 : sessionIdleTimeoutMs();
    const idleMs = Date.now() - record.createdAt.getTime();
    if (idleMs > idleLimitMs) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: authorizedUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Sessão expirada por inactividade');
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

    const tokens = await this.generateTokens(authorizedUserId, email, policy?.accessTokenMinutes);
    await this.persistRefreshToken(
      authorizedUserId,
      tokens.refreshToken,
      { ip: record.ip ?? undefined, userAgent: record.userAgent ?? undefined },
      policy?.refreshTokenDays,
    );
    return tokens;
  }

  async revokeRefreshToken(presented: string, ctx?: AuthRequestContext): Promise<void> {
    const hash = crypto.createHash('sha256').update(presented).digest('hex');
    // Lido antes de revogar só para saber de quem é a sessão — o logout em
    // si não depende deste registo (ver LOGIN acima, mesma tabela).
    const record = await this.prisma.refreshToken.findUnique({ where: { tokenHash: hash } });
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (record) {
      this.recordAccessEvent({
        userId: record.userId,
        action: 'LOGOUT',
        entity: 'Auth',
        entityId: record.userId,
        severity: 'LOW',
        ctx,
      });
      this.prisma.userAuditLog
        .create({ data: { userId: record.userId, performedById: record.userId, action: 'LOGOUT' } })
        .catch((err: unknown) =>
          this.logger.warn({
            userId: record.userId,
            action: 'LOGOUT',
            err: { message: err instanceof Error ? err.message : String(err) },
            msg: 'Falha ao registar UserAuditLog de logout',
          }),
        );
    }
  }

  private async generateTokens(userId: number, email: string, accessMinutes = 15) {
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
      this.jwtService.signAsync(payload, { expiresIn: `${accessMinutes}m` }),
      this.jwtService.signAsync(
        { ...payload, jti: crypto.randomUUID() },
        { expiresIn: '7d', secret: refreshSecret },
      ),
    ]);
    return { accessToken, refreshToken };
  }
}
