import { Test, TestingModule } from '@nestjs/testing';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getDashboard: jest.fn().mockResolvedValue({}),
  findAllTemplates: jest.fn().mockResolvedValue([]),
  findOneTemplate: jest.fn().mockResolvedValue({ id: 1 }),
  createTemplate: jest.fn().mockResolvedValue({ id: 2 }),
  updateTemplate: jest.fn().mockResolvedValue({ id: 1 }),
  deleteTemplate: jest.fn().mockResolvedValue({}),
  addTemplateTask: jest.fn().mockResolvedValue({ id: 1 }),
  updateTemplateTask: jest.fn().mockResolvedValue({}),
  deleteTemplateTask: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  findByUser: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  createFromTemplate: jest.fn().mockResolvedValue({ id: 1 }),
  remove: jest.fn().mockResolvedValue({}),
  completeTask: jest.fn().mockResolvedValue({}),
  skipTask: jest.fn().mockResolvedValue({}),
  approveTask: jest.fn().mockResolvedValue({}),
  uploadDocument: jest.fn().mockResolvedValue({ id: 1 }),
  validateDocument: jest.fn().mockResolvedValue({}),
  submitSurvey: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('OnboardingController', () => {
  let controller: OnboardingController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [{ provide: OnboardingService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<OnboardingController>(OnboardingController);
  });

  it('dashboard sem managerId → getDashboard(undefined)', async () => {
    await controller.dashboard();
    expect(mockSvc.getDashboard).toHaveBeenCalledWith(undefined);
  });

  it('dashboard com managerId → getDashboard(parsed)', async () => {
    await controller.dashboard('3');
    expect(mockSvc.getDashboard).toHaveBeenCalledWith(3);
  });

  it('findAllTemplates → findAllTemplates', async () => {
    await controller.findAllTemplates();
    expect(mockSvc.findAllTemplates).toHaveBeenCalled();
  });

  it('findOneTemplate → findOneTemplate(id)', async () => {
    await controller.findOneTemplate(2);
    expect(mockSvc.findOneTemplate).toHaveBeenCalledWith(2);
  });

  it('createTemplate → createTemplate(dto)', async () => {
    const dto = {} as any;
    await controller.createTemplate(dto);
    expect(mockSvc.createTemplate).toHaveBeenCalledWith(dto);
  });

  it('updateTemplate → updateTemplate(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateTemplate(1, dto);
    expect(mockSvc.updateTemplate).toHaveBeenCalledWith(1, dto);
  });

  it('deleteTemplate → deleteTemplate(id)', async () => {
    await controller.deleteTemplate(1);
    expect(mockSvc.deleteTemplate).toHaveBeenCalledWith(1);
  });

  it('addTemplateTask → addTemplateTask(dto)', async () => {
    const dto = {} as any;
    await controller.addTemplateTask(dto);
    expect(mockSvc.addTemplateTask).toHaveBeenCalledWith(dto);
  });

  it('updateTemplateTask → updateTemplateTask(taskId, dto)', async () => {
    const dto = {} as any;
    await controller.updateTemplateTask(5, dto);
    expect(mockSvc.updateTemplateTask).toHaveBeenCalledWith(5, dto);
  });

  it('deleteTemplateTask → deleteTemplateTask(taskId)', async () => {
    await controller.deleteTemplateTask(4);
    expect(mockSvc.deleteTemplateTask).toHaveBeenCalledWith(4);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('my → findByUser(userId)', async () => {
    await controller.my(mockUser as any);
    expect(mockSvc.findByUser).toHaveBeenCalledWith(1);
  });

  it('byUser → findByUser(userId)', async () => {
    await controller.byUser(3);
    expect(mockSvc.findByUser).toHaveBeenCalledWith(3);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(4);
    expect(mockSvc.findOne).toHaveBeenCalledWith(4);
  });

  it('create → create(dto)', async () => {
    const dto = {} as any;
    await controller.create(dto);
    expect(mockSvc.create).toHaveBeenCalledWith(dto);
  });

  it('autoAssign sem params → createFromTemplate(userId, undefined, undefined)', async () => {
    await controller.autoAssign(5);
    expect(mockSvc.createFromTemplate).toHaveBeenCalledWith(5, undefined, undefined);
  });

  it('autoAssign com params → createFromTemplate(userId, parsed, parsed)', async () => {
    await controller.autoAssign(5, '3', '7');
    expect(mockSvc.createFromTemplate).toHaveBeenCalledWith(5, 3, 7);
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('completeTask → completeTask(dto, userId)', async () => {
    const dto = {} as any;
    await controller.completeTask(mockUser as any, dto);
    expect(mockSvc.completeTask).toHaveBeenCalledWith(dto, 1);
  });

  it('skipTask → skipTask(dto, userId)', async () => {
    const dto = {} as any;
    await controller.skipTask(mockUser as any, dto);
    expect(mockSvc.skipTask).toHaveBeenCalledWith(dto, 1);
  });

  it('approveTask → approveTask(dto, userId)', async () => {
    const dto = {} as any;
    await controller.approveTask(mockUser as any, dto);
    expect(mockSvc.approveTask).toHaveBeenCalledWith(dto, 1);
  });

  it('uploadDocument → uploadDocument(userId, dto)', async () => {
    const dto = {} as any;
    await controller.uploadDocument(mockUser as any, dto);
    expect(mockSvc.uploadDocument).toHaveBeenCalledWith(1, dto);
  });

  it('validateDocument → validateDocument(dto, userId)', async () => {
    const dto = {} as any;
    await controller.validateDocument(mockUser as any, dto);
    expect(mockSvc.validateDocument).toHaveBeenCalledWith(dto, 1);
  });

  it('submitSurvey → submitSurvey(userId, dto)', async () => {
    const dto = {} as any;
    await controller.submitSurvey(mockUser as any, dto);
    expect(mockSvc.submitSurvey).toHaveBeenCalledWith(1, dto);
  });
});
