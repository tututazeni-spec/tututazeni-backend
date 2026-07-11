import { Controller, Post, Get, Body, Patch, UseGuards, Req, Res, HttpCode } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from './enums/role.enum';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import {
  LoginDto,
  RegisterDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokenGuard } from './refresh-token.guard';
import { Request, Response } from 'express';
import {
  TOKEN_COOKIE,
  buildTokenCookieOptions,
  REFRESH_COOKIE,
  buildRefreshCookieOptions,
} from './token-cookie';

// JwtStrategy.validate() devolve a entidade User (tem `id`, não `sub`).
interface AuthenticatedRequest extends Request {
  user: { id: number; email: string };
}

const tokenCookieOptions = buildTokenCookieOptions(process.env.NODE_ENV === 'production');
const refreshCookieOptions = buildRefreshCookieOptions(process.env.NODE_ENV === 'production');

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passwordReset: PasswordResetService,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    res.cookie(TOKEN_COOKIE, result.accessToken, tokenCookieOptions);
    res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
    return result;
  }

  // Criação de contas é uma operação administrativa: apenas ADMIN e RH.
  // NÃO define o cookie de sessão — quem cria a conta não deve ficar autenticado
  // como o novo utilizador. Os tokens devolvidos servem só para entrega segura.
  @Post('register')
  @Roles(Role.ADMIN, Role.RH)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('refresh')
  @UseGuards(RefreshTokenGuard)
  async refresh(
    @Req() req: Request & { user: { id: number; email: string; refreshToken: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.rotateRefreshToken(
      req.user.id,
      req.user.email,
      req.user.refreshToken,
    );
    res.cookie(TOKEN_COOKIE, result.accessToken, tokenCookieOptions);
    res.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions);
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const presented = (req.cookies ?? {}).refresh_token;
    if (presented) await this.authService.revokeRefreshToken(presented);
    res.clearCookie(TOKEN_COOKIE, { ...tokenCookieOptions, maxAge: undefined });
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
    return { message: 'Sessão terminada' };
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  changePassword(@Req() req: AuthenticatedRequest, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto);
  }

  // Recuperação de password: quem a usa NÃO está autenticado — tem de ser pública.
  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.passwordReset.forgotPassword(dto.email);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.passwordReset.resetPassword(dto.token, dto.newPassword);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.me(req.user.id);
  }
}
