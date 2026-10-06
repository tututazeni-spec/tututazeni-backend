// src/auth/sso.controller.ts
// Rotas de login para Definições §11 (Autenticação/SSO). Todas públicas — são
// usadas antes de haver sessão. A configuração/administração vive em
// /settings/auth (SettingsController, só ADMIN).
import { Controller, Get, Post, Body, Query, Req, Res, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { SsoAuthService } from './sso-auth.service';
import { AuthSettingsService } from '../settings/auth-settings.service';
import { LdapLoginDto } from '../settings/settings.dto';
import { authThrottleLimit } from './auth.controller';
import {
  TOKEN_COOKIE,
  buildTokenCookieOptions,
  REFRESH_COOKIE,
  buildRefreshCookieOptions,
} from './token-cookie';

const SSO_THROTTLE = { default: { limit: authThrottleLimit(), ttl: 60000 } };
const tokenCookieOptions = buildTokenCookieOptions(process.env.NODE_ENV === 'production');
const refreshCookieOptions = buildRefreshCookieOptions(process.env.NODE_ENV === 'production');

function requestContext(req: Request): { ip?: string; userAgent?: string } {
  const ua = req.headers?.['user-agent'];
  return { ip: req.ip, userAgent: Array.isArray(ua) ? ua[0] : ua };
}

/** Após o callback (navegação de topo do browser, sem forma de ler JSON), a sessão
 *  fica nos cookies httpOnly e o browser é redireccionado para o frontend. */
function frontendUrl(path: string): string {
  const base = (process.env.APP_URL ?? '').replace(/\/$/, '');
  return `${base}${path}`;
}

@Controller('auth/sso')
export class SsoController {
  constructor(
    private readonly sso: SsoAuthService,
    private readonly authSettings: AuthSettingsService,
  ) {}

  @Public()
  @Get('options')
  options() {
    return this.authSettings.getPublicLoginOptions();
  }

  @Public()
  @Get('login')
  async login(@Res() res: Response) {
    const url = await this.sso.buildAuthorizationUrl();
    res.redirect(url);
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (error || !code || !state) {
      res.redirect(frontendUrl(`/login?ssoError=${encodeURIComponent(error ?? 'sso_failed')}`));
      return;
    }
    try {
      const result = await this.sso.handleCallback(code, state, requestContext(req));
      res.cookie(TOKEN_COOKIE, result.accessToken, tokenCookieOptions);
      res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
      res.redirect(frontendUrl('/dashboard'));
    } catch (err: unknown) {
      const message = err instanceof BadRequestException ? err.message : 'sso_failed';
      res.redirect(frontendUrl(`/login?ssoError=${encodeURIComponent(message)}`));
    }
  }

  @Public()
  @Throttle(SSO_THROTTLE)
  @Post('ldap-login')
  async ldapLogin(
    @Body() dto: LdapLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.sso.ldapLogin(dto.email, dto.password, requestContext(req));
    res.cookie(TOKEN_COOKIE, result.accessToken, tokenCookieOptions);
    res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
    return result;
  }
}
