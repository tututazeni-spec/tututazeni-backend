import { Test, TestingModule } from '@nestjs/testing';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';
import { CurrentUserData } from '../common/decorators';

const mockUser: CurrentUserData = {
  id: 42,
  email: 'test@innova.com',
  active: true,
  roleId: 1,
  role: { id: 1, name: 'COLABORADOR' },
};

const mockService = {
  registerSession: jest.fn().mockResolvedValue({ id: 1 }),
  updatePushToken: jest.fn().mockResolvedValue({ updated: true }),
  logSync: jest.fn().mockResolvedValue({ id: 1 }),
  getUserMobileDashboard: jest.fn().mockResolvedValue({ enrollments: [], evaluations: [] }),
};

describe('MobileController', () => {
  let controller: MobileController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobileController],
      providers: [{ provide: MobileService, useValue: mockService }],
    }).compile();
    controller = module.get<MobileController>(MobileController);
  });

  it('registerSession usa user.id do JWT — não aceita userId do body', async () => {
    await controller.registerSession('dev-001', 'ios', mockUser, 'push-tok');
    expect(mockService.registerSession).toHaveBeenCalledWith(42, 'dev-001', 'ios', 'push-tok');
  });

  it('logSync usa user.id do JWT — não aceita userId do body', async () => {
    await controller.logSync('enrollment', 'SUCCESS', mockUser);
    expect(mockService.logSync).toHaveBeenCalledWith(42, 'enrollment', 'SUCCESS');
  });

  it('getDashboard usa user.id do JWT — não aceita userId do path', async () => {
    await controller.getDashboard(mockUser);
    expect(mockService.getUserMobileDashboard).toHaveBeenCalledWith(42);
  });

  it('updatePushToken passa sessionId + pushToken + userId do JWT', async () => {
    await controller.updatePushToken(7, 'new-tok', mockUser);
    expect(mockService.updatePushToken).toHaveBeenCalledWith(7, 'new-tok', 42);
  });
});
