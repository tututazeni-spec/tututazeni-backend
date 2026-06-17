import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const mockSvc = {
  login: jest.fn().mockResolvedValue({ accessToken: 'tok', refreshToken: 'ref', user: {} }),
  register: jest.fn().mockResolvedValue({ accessToken: 'tok', refreshToken: 'ref', user: {} }),
  refreshToken: jest.fn().mockResolvedValue({ accessToken: 'tok', refreshToken: 'ref' }),
  changePassword: jest.fn().mockResolvedValue({ message: 'ok' }),
  forgotPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
  resetPassword: jest.fn().mockResolvedValue({ message: 'ok' }),
  me: jest.fn().mockResolvedValue({ id: 1, email: 'test@innova.com', fullName: 'Test' }),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
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
    await controller.register(dto as any, mockRes as any);
    expect(mockSvc.register).toHaveBeenCalledWith(dto);
  });

  it('refresh → chama authService.refreshToken', async () => {
    const req = { user: { id: 1, email: 'a@b.com' } };
    await controller.refresh(req as any, mockRes as any);
    expect(mockSvc.refreshToken).toHaveBeenCalledWith(1, 'a@b.com');
  });

  it('changePassword → chama authService.changePassword', async () => {
    const req = { user: { id: 1, email: 'a@b.com' } };
    const dto = { oldPassword: 'old', newPassword: 'new' };
    await controller.changePassword(req as any, dto as any);
    expect(mockSvc.changePassword).toHaveBeenCalledWith(1, dto);
  });

  it('forgotPassword → chama authService.forgotPassword', async () => {
    const dto = { email: 'a@b.com' };
    await controller.forgotPassword(dto as any);
    expect(mockSvc.forgotPassword).toHaveBeenCalledWith(dto);
  });

  it('resetPassword → chama authService.resetPassword', async () => {
    const dto = { token: 'tok', newPassword: 'new' };
    await controller.resetPassword(dto as any);
    expect(mockSvc.resetPassword).toHaveBeenCalledWith(dto);
  });

  it('me → chama authService.me', async () => {
    const req = { user: { id: 1, email: 'a@b.com' } };
    const result = await controller.me(req as any);
    expect(mockSvc.me).toHaveBeenCalledWith(1);
    expect(result).toHaveProperty('id', 1);
  });
});
