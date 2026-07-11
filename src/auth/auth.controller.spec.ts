import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetService } from './password-reset.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RefreshTokenGuard } from './refresh-token.guard';

// C2: verifica que @Throttle({ default: { limit: 5, ttl: 60000 } }) está presente
// @nestjs/throttler v6 guarda metadata em 'THROTTLER:LIMIT' + throttleName (ex: 'default')
describe('AuthController throttle metadata (C2)', () => {
  it('login tem throttle dedicado apertado (<= 5 req/min)', () => {
    // throttler v6: Reflect.getMetadata('THROTTLER:LIMITdefault', prototype.method)
    const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', AuthController.prototype.login);
    expect(limit).toBeDefined();
    expect(limit).toBeLessThanOrEqual(5);
  });

  it('forgotPassword tem throttle dedicado (<= 5 req/min)', () => {
    const limit = Reflect.getMetadata(
      'THROTTLER:LIMITdefault',
      AuthController.prototype.forgotPassword,
    );
    expect(limit).toBeDefined();
    expect(limit).toBeLessThanOrEqual(5);
  });
});

const mockSvc = {
  login: jest.fn().mockResolvedValue({ accessToken: 'tok', refreshToken: 'ref', user: {} }),
  register: jest.fn().mockResolvedValue({ accessToken: 'tok', refreshToken: 'ref', user: {} }),
  rotateRefreshToken: jest.fn().mockResolvedValue({ accessToken: 'tok', refreshToken: 'ref' }),
  revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
  changePassword: jest.fn().mockResolvedValue({ message: 'ok' }),
  me: jest.fn().mockResolvedValue({ id: 1, email: 'test@innova.com', fullName: 'Test' }),
};

const mockPasswordReset = {
  forgotPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
  resetPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockSvc },
        { provide: PasswordResetService, useValue: mockPasswordReset },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RefreshTokenGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AuthController>(AuthController);
  });

  // O backend passou a emitir o JWT por cookie httpOnly, por isso os
  // endpoints recebem agora @Res({ passthrough: true }) res.
  const mockRes = { cookie: jest.fn(), clearCookie: jest.fn() };

  it('login → chama authService.login', async () => {
    const dto = { email: 'a@b.com', password: '123' };
    const result = await controller.login(dto as any, mockRes as any);
    expect(mockSvc.login).toHaveBeenCalledWith(dto);
    expect(result).toHaveProperty('accessToken');
  });

  it('register → chama authService.register', async () => {
    const dto = { email: 'a@b.com', password: '123', fullName: 'Test' };
    // register é operação administrativa: não recebe @Res nem define cookie.
    await controller.register(dto as any);
    expect(mockSvc.register).toHaveBeenCalledWith(dto);
    expect(mockRes.cookie).not.toHaveBeenCalled();
  });

  it('refresh → chama authService.rotateRefreshToken', async () => {
    const req = { user: { id: 1, email: 'a@b.com', refreshToken: 'ref-tok' } };
    await controller.refresh(req as any, mockRes as any);
    expect(mockSvc.rotateRefreshToken).toHaveBeenCalledWith(1, 'a@b.com', 'ref-tok');
  });

  it('changePassword → chama authService.changePassword', async () => {
    const req = { user: { id: 1, email: 'a@b.com' } };
    const dto = { oldPassword: 'old', newPassword: 'new' };
    await controller.changePassword(req as any, dto as any);
    expect(mockSvc.changePassword).toHaveBeenCalledWith(1, dto);
  });

  it('forgotPassword → chama passwordReset.forgotPassword com email', async () => {
    const dto = { email: 'a@b.com' };
    await controller.forgotPassword(dto as any);
    expect(mockPasswordReset.forgotPassword).toHaveBeenCalledWith('a@b.com');
  });

  it('resetPassword → chama passwordReset.resetPassword com token e newPassword', async () => {
    const dto = { token: 'tok', newPassword: 'new' };
    await controller.resetPassword(dto as any);
    expect(mockPasswordReset.resetPassword).toHaveBeenCalledWith('tok', 'new');
  });

  it('me → chama authService.me', async () => {
    const req = { user: { id: 1, email: 'a@b.com' } };
    const result = await controller.me(req as any);
    expect(mockSvc.me).toHaveBeenCalledWith(1);
    expect(result).toHaveProperty('id', 1);
  });
});
