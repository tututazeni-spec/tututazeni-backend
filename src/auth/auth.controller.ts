import { Controller, Post, Get, Body, Patch, UseGuards, Req, Res, HttpCode } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RegisterDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './auth.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { Request, Response, CookieOptions } from 'express';

// JwtStrategy.validate() devolve a entidade User (tem `id`, não `sub`).
interface AuthenticatedRequest extends Request {
  user: { id: number; email: string };
}

const isProd = process.env.NODE_ENV === 'production';

// Cookie httpOnly que transporta o access token. JS no browser nunca lê este
// valor (mitiga XSS). Em produção exige cross-site seguro (none+secure); em dev
// (localhost:3000 -> localhost:4000, mesmo site) basta 'lax'.
const TOKEN_COOKIE = 'token';
const tokenCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias (sessão); o JWT em si expira antes
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.login(dto);
    res.cookie(TOKEN_COOKIE, result.accessToken, tokenCookieOptions);
    return result;
  }

  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.register(dto);
    res.cookie(TOKEN_COOKIE, result.accessToken, tokenCookieOptions);
    return result;
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

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest) {
    return this.authService.me(req.user.id);
  }
}
