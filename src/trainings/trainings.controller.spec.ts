import { Test, TestingModule } from '@nestjs/testing';
import { TrainingController } from './trainings.controller';
import { TrainingService } from './trainings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getAdminDashboard: jest.fn().mockResolvedValue({}),
  findForManagement: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getMyTrainings: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getAttendanceReport: jest.fn().mockResolvedValue({}),
  getResults: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  publish: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
  archive: jest.fn().mockResolvedValue({ status: 'ARCHIVED' }),
  remove: jest.fn().mockResolvedValue({}),
  notifyParticipants: jest.fn().mockResolvedValue({ sent: 0 }),
  addDocument: jest.fn().mockResolvedValue({ id: 1 }),
  removeDocument: jest.fn().mockResolvedValue({}),
  linkAssessment: jest.fn().mockResolvedValue({ id: 1 }),
  unlinkAssessment: jest.fn().mockResolvedValue({}),
  createSession: jest.fn().mockResolvedValue({ id: 1 }),
  updateSession: jest.fn().mockResolvedValue({}),
  removeSession: jest.fn().mockResolvedValue({}),
  getSessionParticipants: jest.fn().mockResolvedValue([]),
  registerParticipant: jest.fn().mockResolvedValue({ id: 1 }),
  cancelParticipant: jest.fn().mockResolvedValue({}),
  updateParticipantStatus: jest.fn().mockResolvedValue({}),
  approveParticipant: jest.fn().mockResolvedValue({}),
  rejectParticipant: jest.fn().mockResolvedValue({}),
  bulkAttendance: jest.fn().mockResolvedValue({ updated: 0 }),
  rateTraining: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('TrainingController', () => {
  let controller: TrainingController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TrainingController],
      providers: [{ provide: TrainingService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<TrainingController>(TrainingController);
  });

  it('dashboard → getAdminDashboard', async () => {
    await controller.dashboard();
    expect(mockSvc.getAdminDashboard).toHaveBeenCalled();
  });

  it('manage → findForManagement(filters, user)', async () => {
    const filters = {} as any;
    await controller.manage(filters, mockUser as any);
    expect(mockSvc.findForManagement).toHaveBeenCalledWith(filters, mockUser);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('myTrainings → getMyTrainings(userId)', async () => {
    await controller.myTrainings(mockUser as any);
    expect(mockSvc.getMyTrainings).toHaveBeenCalledWith(1);
  });

  it('findOne → findOne(id, user)', async () => {
    await controller.findOne(3, mockUser as any);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3, mockUser);
  });

  it('attendanceReport → getAttendanceReport(id)', async () => {
    await controller.attendanceReport(2);
    expect(mockSvc.getAttendanceReport).toHaveBeenCalledWith(2);
  });

  it('results → getResults(id)', async () => {
    await controller.results(2);
    expect(mockSvc.getResults).toHaveBeenCalledWith(2);
  });

  it('create → create(dto, userId)', async () => {
    const dto = {} as any;
    await controller.create(dto, mockUser as any);
    expect(mockSvc.create).toHaveBeenCalledWith(dto, 1);
  });

  it('update → update(id, dto, user)', async () => {
    const dto = {} as any;
    await controller.update(1, dto, mockUser as any);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto, mockUser);
  });

  it('publish → publish(id, user)', async () => {
    await controller.publish(1, mockUser as any);
    expect(mockSvc.publish).toHaveBeenCalledWith(1, mockUser);
  });

  it('archive → archive(id, user)', async () => {
    await controller.archive(1, mockUser as any);
    expect(mockSvc.archive).toHaveBeenCalledWith(1, mockUser);
  });

  it('remove → remove(id, user)', async () => {
    await controller.remove(1, mockUser as any);
    expect(mockSvc.remove).toHaveBeenCalledWith(1, mockUser);
  });

  it('notify → notifyParticipants(id, dto, user)', async () => {
    const dto = {} as any;
    await controller.notify(1, dto, mockUser as any);
    expect(mockSvc.notifyParticipants).toHaveBeenCalledWith(1, dto, mockUser);
  });

  it('addDocument → addDocument(id, dto, user)', async () => {
    const dto = {} as any;
    await controller.addDocument(1, dto, mockUser as any);
    expect(mockSvc.addDocument).toHaveBeenCalledWith(1, dto, mockUser);
  });

  it('removeDocument → removeDocument(documentId, user)', async () => {
    await controller.removeDocument(9, mockUser as any);
    expect(mockSvc.removeDocument).toHaveBeenCalledWith(9, mockUser);
  });

  it('linkAssessment → linkAssessment(id, dto, user)', async () => {
    const dto = {} as any;
    await controller.linkAssessment(1, dto, mockUser as any);
    expect(mockSvc.linkAssessment).toHaveBeenCalledWith(1, dto, mockUser);
  });

  it('unlinkAssessment → unlinkAssessment(id, role, user)', async () => {
    await controller.unlinkAssessment(1, 'INITIAL' as any, mockUser as any);
    expect(mockSvc.unlinkAssessment).toHaveBeenCalledWith(1, 'INITIAL', mockUser);
  });

  it('createSession → createSession(dto, user)', async () => {
    const dto = {} as any;
    await controller.createSession(dto, mockUser as any);
    expect(mockSvc.createSession).toHaveBeenCalledWith(dto, mockUser);
  });

  it('updateSession → updateSession(id, dto, user)', async () => {
    const dto = {} as any;
    await controller.updateSession(2, dto, mockUser as any);
    expect(mockSvc.updateSession).toHaveBeenCalledWith(2, dto, mockUser);
  });

  it('removeSession → removeSession(id, user)', async () => {
    await controller.removeSession(3, mockUser as any);
    expect(mockSvc.removeSession).toHaveBeenCalledWith(3, mockUser);
  });

  it('sessionParticipants → getSessionParticipants(id)', async () => {
    await controller.sessionParticipants(4);
    expect(mockSvc.getSessionParticipants).toHaveBeenCalledWith(4);
  });

  it('register → registerParticipant(dto)', async () => {
    const dto = {} as any;
    await controller.register(dto);
    expect(mockSvc.registerParticipant).toHaveBeenCalledWith(dto);
  });

  it('selfRegister → registerParticipant com userId e allowWaitlist', async () => {
    await controller.selfRegister(mockUser as any, 5);
    expect(mockSvc.registerParticipant).toHaveBeenCalledWith({
      sessionId: 5,
      userId: 1,
      allowWaitlist: true,
    });
  });

  it('cancelParticipant → cancelParticipant(id, userId)', async () => {
    await controller.cancelParticipant(3, mockUser as any);
    expect(mockSvc.cancelParticipant).toHaveBeenCalledWith(3, 1, undefined);
  });

  it('updateParticipantStatus → updateParticipantStatus(id, dto, user.id)', async () => {
    const dto = {} as any;
    await controller.updateParticipantStatus(5, dto, mockUser as any);
    expect(mockSvc.updateParticipantStatus).toHaveBeenCalledWith(5, dto, mockUser.id);
  });

  it('approveParticipant → approveParticipant(id, user)', async () => {
    await controller.approveParticipant(6, mockUser as any);
    expect(mockSvc.approveParticipant).toHaveBeenCalledWith(6, mockUser);
  });

  it('rejectParticipant → rejectParticipant(id, dto, user)', async () => {
    const dto = {} as any;
    await controller.rejectParticipant(6, dto, mockUser as any);
    expect(mockSvc.rejectParticipant).toHaveBeenCalledWith(6, dto, mockUser);
  });

  it('bulkAttendance → bulkAttendance(dto, userId)', async () => {
    const dto = {} as any;
    await controller.bulkAttendance(mockUser as any, dto);
    expect(mockSvc.bulkAttendance).toHaveBeenCalledWith(dto, 1);
  });

  it('rate → rateTraining(userId, dto)', async () => {
    const dto = {} as any;
    await controller.rate(mockUser as any, dto);
    expect(mockSvc.rateTraining).toHaveBeenCalledWith(1, dto);
  });
});
