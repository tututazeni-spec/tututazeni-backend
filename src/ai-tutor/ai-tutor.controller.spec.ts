import { Test, TestingModule } from '@nestjs/testing';
import { AiTutorController } from './ai-tutor.controller';
import { AiTutorService } from './ai-tutor.service';
import { AiProvidersService } from './ai-providers.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getUsageStats: jest.fn().mockResolvedValue({}),
  getMySessions: jest.fn().mockResolvedValue([]),
  getSession: jest.fn().mockResolvedValue({ id: 1 }),
  startSession: jest.fn().mockResolvedValue({ id: 1 }),
  sendMessage: jest.fn().mockResolvedValue({ reply: 'ok' }),
  endSession: jest.fn().mockResolvedValue({}),
  rateMessage: jest.fn().mockResolvedValue({}),
  executeAgentAction: jest.fn().mockResolvedValue({}),
  generateContent: jest.fn().mockResolvedValue({}),
  getRecommendations: jest.fn().mockResolvedValue([]),
};

const mockProviders = {
  getProviderInfo: jest.fn().mockReturnValue({ name: 'Groq' }),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('AiTutorController', () => {
  let controller: AiTutorController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiTutorController],
      providers: [
        { provide: AiTutorService, useValue: mockSvc },
        { provide: AiProvidersService, useValue: mockProviders },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AiTutorController>(AiTutorController);
  });

  it('getProvider → getProviderInfo', () => {
    controller.getProvider();
    expect(mockProviders.getProviderInfo).toHaveBeenCalled();
  });

  it('stats → getUsageStats', async () => {
    await controller.stats();
    expect(mockSvc.getUsageStats).toHaveBeenCalled();
  });

  it('mySessions → getMySessions(userId, filters)', async () => {
    const filters = {} as any;
    await controller.mySessions(mockUser as any, filters);
    expect(mockSvc.getMySessions).toHaveBeenCalledWith(1, filters);
  });

  it('getSession → getSession(userId, id)', async () => {
    await controller.getSession(mockUser as any, 3);
    expect(mockSvc.getSession).toHaveBeenCalledWith(1, 3);
  });

  it('startSession → startSession(userId, dto)', async () => {
    const dto = {} as any;
    await controller.startSession(mockUser as any, dto);
    expect(mockSvc.startSession).toHaveBeenCalledWith(1, dto);
  });

  it('sendMessage → sendMessage(userId, dto)', async () => {
    const dto = {} as any;
    await controller.sendMessage(mockUser as any, dto);
    expect(mockSvc.sendMessage).toHaveBeenCalledWith(1, dto);
  });

  it('endSession → endSession(userId, id)', async () => {
    await controller.endSession(mockUser as any, 2);
    expect(mockSvc.endSession).toHaveBeenCalledWith(1, 2);
  });

  it('rateMessage → rateMessage(userId, dto)', async () => {
    const dto = {} as any;
    await controller.rateMessage(mockUser as any, dto);
    expect(mockSvc.rateMessage).toHaveBeenCalledWith(1, dto);
  });

  it('executeAction → executeAgentAction(userId, dto)', async () => {
    const dto = {} as any;
    await controller.executeAction(mockUser as any, dto);
    expect(mockSvc.executeAgentAction).toHaveBeenCalledWith(1, dto);
  });

  it('generateContent → generateContent(userId, dto)', async () => {
    const dto = {} as any;
    await controller.generateContent(mockUser as any, dto);
    expect(mockSvc.generateContent).toHaveBeenCalledWith(1, dto);
  });

  it('recommendations → getRecommendations(userId)', async () => {
    await controller.recommendations(mockUser as any);
    expect(mockSvc.getRecommendations).toHaveBeenCalledWith(1);
  });
});
