import { Test, TestingModule } from '@nestjs/testing';
import { MobileController } from './mobile.controller';
import { MobileService } from './mobile.service';

const mockSvc = {
  registerSession: jest.fn().mockResolvedValue({ id: 1 }),
  updatePushToken: jest.fn().mockResolvedValue({}),
  logSync: jest.fn().mockResolvedValue({}),
  getUserMobileDashboard: jest.fn().mockResolvedValue({}),
};

describe('MobileController', () => {
  let controller: MobileController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MobileController],
      providers: [{ provide: MobileService, useValue: mockSvc }],
    }).compile();
    controller = module.get<MobileController>(MobileController);
  });

  it('registerSession → registerSession(userId, deviceId, platform)', async () => {
    await controller.registerSession(1, 'device-123', 'ios');
    expect(mockSvc.registerSession).toHaveBeenCalledWith(1, 'device-123', 'ios', undefined);
  });

  it('updatePushToken → updatePushToken(id, pushToken)', async () => {
    await controller.updatePushToken(2, 'token-abc');
    expect(mockSvc.updatePushToken).toHaveBeenCalledWith(2, 'token-abc');
  });

  it('logSync → logSync(userId, entity, status)', async () => {
    await controller.logSync(1, 'user', 'SUCCESS');
    expect(mockSvc.logSync).toHaveBeenCalledWith(1, 'user', 'SUCCESS');
  });

  it('getDashboard → getUserMobileDashboard(userId)', async () => {
    await controller.getDashboard(3);
    expect(mockSvc.getUserMobileDashboard).toHaveBeenCalledWith(3);
  });
});
