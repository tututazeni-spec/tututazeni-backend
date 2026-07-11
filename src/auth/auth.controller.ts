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
import { Request, Response } from 'express';
import { TOKEN_COOKIE, buildTokenCookieOptions } from './token-cookie';

// JwtStrategy.validate() devolve a entidade User (tem `id`, não `sub`).
interface AuthenticatedRequest extends Request {
  user: { id: number; email: string };
}

const tokenCookieOptions = buildTokenCookieOptions(process.env.NODE_ENV === 'production');

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

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  async refresh(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.refreshToken(req.user.id, req.user.email);
    res.cookie(TOKEN_COOKIE, result.accessToken, tokenCookieOptions);
    return result;
  }

  @Public()
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(TOKEN_COOKIE, { ...tokenCookieOptions, maxAge: undefined });
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
