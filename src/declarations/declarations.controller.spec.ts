import { Test, TestingModule } from '@nestjs/testing';
import {
  DocumentDeclarationsController,
  WorkDeclarationsController,
} from './declarations.controller';
import { DocumentDeclarationsService } from './document-declarations.service';
import { WorkDeclarationsService } from './work-declarations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockDocSvc = {
  getDashboard: jest.fn().mockResolvedValue({}),
  getPurposes: jest.fn().mockResolvedValue([]),
  createPurpose: jest.fn().mockResolvedValue({ id: 1 }),
  updatePurpose: jest.fn().mockResolvedValue({}),
  getTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue({ id: 1 }),
  previewTemplate: jest.fn().mockResolvedValue('<html>'),
  createTemplate: jest.fn().mockResolvedValue({ id: 2 }),
  updateTemplate: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  request: jest.fn().mockResolvedValue({ id: 1 }),
  approve: jest.fn().mockResolvedValue({}),
  generate: jest.fn().mockResolvedValue({}),
  issue: jest.fn().mockResolvedValue({}),
  verify: jest.fn().mockResolvedValue({ valid: true }),
};

const mockWorkSvc = {
  getDashboard: jest.fn().mockResolvedValue({}),
  getComplianceReport: jest.fn().mockResolvedValue({}),
  getForms: jest.fn().mockResolvedValue([]),
  getForm: jest.fn().mockResolvedValue({ id: 1 }),
  createForm: jest.fn().mockResolvedValue({ id: 1 }),
  updateForm: jest.fn().mockResolvedValue({}),
  sendReminder: jest.fn().mockResolvedValue({}),
  getPendingForUser: jest.fn().mockResolvedValue([]),
  findSubmissions: jest.fn().mockResolvedValue([]),
  findOneSubmission: jest.fn().mockResolvedValue({ id: 1 }),
  submit: jest.fn().mockResolvedValue({ id: 1 }),
  review: jest.fn().mockResolvedValue({}),
  bulkApprove: jest.fn().mockResolvedValue({}),
  exemptUser: jest.fn().mockResolvedValue({}),
  triggerOnboarding: jest.fn().mockResolvedValue({}),
  triggerPeriodic: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('DocumentDeclarationsController', () => {
  let controller: DocumentDeclarationsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentDeclarationsController],
      providers: [{ provide: DocumentDeclarationsService, useValue: mockDocSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<DocumentDeclarationsController>(DocumentDeclarationsController);
  });

  it('getDashboard → getDashboard', async () => {
    await controller.getDashboard();
    expect(mockDocSvc.getDashboard).toHaveBeenCalled();
  });

  it('getPurposes → getPurposes(true)', async () => {
    await controller.getPurposes();
    expect(mockDocSvc.getPurposes).toHaveBeenCalledWith(true);
  });

  it('createPurpose → createPurpose(dto)', async () => {
    const dto = {} as any;
    await controller.createPurpose(dto);
    expect(mockDocSvc.createPurpose).toHaveBeenCalledWith(dto);
  });

  it('updatePurpose → updatePurpose(id, dto)', async () => {
    const dto = {} as any;
    await controller.updatePurpose(1, dto);
    expect(mockDocSvc.updatePurpose).toHaveBeenCalledWith(1, dto);
  });

  it('getTemplates → getTemplates', async () => {
    await controller.getTemplates();
    expect(mockDocSvc.getTemplates).toHaveBeenCalled();
  });

  it('getTemplate → getTemplate(id)', async () => {
    await controller.getTemplate(2);
    expect(mockDocSvc.getTemplate).toHaveBeenCalledWith(2);
  });

  it('previewTemplate → previewTemplate(id, userId)', async () => {
    await controller.previewTemplate(1, mockUser as any);
    expect(mockDocSvc.previewTemplate).toHaveBeenCalledWith(1, 1);
  });

  it('createTemplate → createTemplate(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createTemplate(dto, mockUser as any);
    expect(mockDocSvc.createTemplate).toHaveBeenCalledWith(dto, 1);
  });

  it('updateTemplate → updateTemplate(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateTemplate(1, dto, mockUser as any);
    expect(mockDocSvc.updateTemplate).toHaveBeenCalledWith(1, dto, 1);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockDocSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('myRequests → findAll({userId})', async () => {
    await controller.myRequests(mockUser as any);
    expect(mockDocSvc.findAll).toHaveBeenCalledWith({ userId: 1 });
  });

  it('findOne → findOne(id, userId)', async () => {
    await controller.findOne(3, mockUser as any);
    expect(mockDocSvc.findOne).toHaveBeenCalledWith(3, 1);
  });

  it('request → request(userId, dto)', async () => {
    const dto = {} as any;
    await controller.request(mockUser as any, dto);
    expect(mockDocSvc.request).toHaveBeenCalledWith(1, dto);
  });

  it('approve → approve(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.approve(2, mockUser as any, dto);
    expect(mockDocSvc.approve).toHaveBeenCalledWith(2, 1, dto);
  });

  it('generate → generate(id, userId)', async () => {
    await controller.generate(3, mockUser as any);
    expect(mockDocSvc.generate).toHaveBeenCalledWith(3, 1);
  });

  it('issue → issue(id, userId)', async () => {
    await controller.issue(4, mockUser as any);
    expect(mockDocSvc.issue).toHaveBeenCalledWith(4, 1);
  });

  it('verify → verify(code)', async () => {
    await controller.verify('CODE-ABC');
    expect(mockDocSvc.verify).toHaveBeenCalledWith('CODE-ABC');
  });
});

describe('WorkDeclarationsController', () => {
  let controller: WorkDeclarationsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkDeclarationsController],
      providers: [{ provide: WorkDeclarationsService, useValue: mockWorkSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<WorkDeclarationsController>(WorkDeclarationsController);
  });

  it('getDashboard → getDashboard', async () => {
    await controller.getDashboard();
    expect(mockWorkSvc.getDashboard).toHaveBeenCalledWith(undefined);
  });

  it('getComplianceReport → getComplianceReport', async () => {
    await controller.getComplianceReport();
    expect(mockWorkSvc.getComplianceReport).toHaveBeenCalledWith(undefined);
  });

  it('getForms → getForms(type, true)', async () => {
    await controller.getForms();
    expect(mockWorkSvc.getForms).toHaveBeenCalledWith(undefined, true);
  });

  it('getForm → getForm(id)', async () => {
    await controller.getForm(2);
    expect(mockWorkSvc.getForm).toHaveBeenCalledWith(2);
  });

  it('createForm → createForm(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createForm(dto, mockUser as any);
    expect(mockWorkSvc.createForm).toHaveBeenCalledWith(dto, 1);
  });

  it('updateForm → updateForm(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.updateForm(1, dto, mockUser as any);
    expect(mockWorkSvc.updateForm).toHaveBeenCalledWith(1, dto, 1);
  });

  it('sendReminder → sendReminder(id)', async () => {
    await controller.sendReminder(3);
    expect(mockWorkSvc.sendReminder).toHaveBeenCalledWith(3, undefined);
  });

  it('getPending → getPendingForUser(userId)', async () => {
    await controller.getPending(mockUser as any);
    expect(mockWorkSvc.getPendingForUser).toHaveBeenCalledWith(1);
  });

  it('mySubmissions → findSubmissions({userId})', async () => {
    await controller.mySubmissions(mockUser as any);
    expect(mockWorkSvc.findSubmissions).toHaveBeenCalledWith({ userId: 1 });
  });

  it('findSubmissions → findSubmissions(filters)', async () => {
    const filters = {} as any;
    await controller.findSubmissions(filters);
    expect(mockWorkSvc.findSubmissions).toHaveBeenCalledWith(filters);
  });

  it('findOne → findOneSubmission(id)', async () => {
    await controller.findOne(4);
    expect(mockWorkSvc.findOneSubmission).toHaveBeenCalledWith(4);
  });

  it('submit → submit(userId, dto)', async () => {
    const dto = {} as any;
    await controller.submit(mockUser as any, dto);
    expect(mockWorkSvc.submit).toHaveBeenCalledWith(1, dto);
  });

  it('review → review(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.review(2, dto, mockUser as any);
    expect(mockWorkSvc.review).toHaveBeenCalledWith(2, dto, 1);
  });

  it('bulkApprove → bulkApprove(dto, userId)', async () => {
    const dto = {} as any;
    await controller.bulkApprove(dto, mockUser as any);
    expect(mockWorkSvc.bulkApprove).toHaveBeenCalledWith(dto, 1);
  });

  it('exempt → exemptUser(id, reason, userId)', async () => {
    await controller.exempt(3, { reason: 'motivo' }, mockUser as any);
    expect(mockWorkSvc.exemptUser).toHaveBeenCalledWith(3, 'motivo', 1);
  });

  it('triggerOnboarding → triggerOnboarding(userId)', async () => {
    await controller.triggerOnboarding(5);
    expect(mockWorkSvc.triggerOnboarding).toHaveBeenCalledWith(5);
  });

  it('triggerPeriodic → triggerPeriodic', async () => {
    await controller.triggerPeriodic();
    expect(mockWorkSvc.triggerPeriodic).toHaveBeenCalled();
  });
});
