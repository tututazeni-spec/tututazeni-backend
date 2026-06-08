import { Test, TestingModule } from '@nestjs/testing';
import { TrainingController } from './trainings.controller';
import { TrainingService } from './trainings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getAdminDashboard: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getMyTrainings: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getAttendanceReport: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  publish: jest.fn().mockResolvedValue({ status: 'PUBLISHED' }),
  archive: jest.fn().mockResolvedValue({ status: 'ARCHIVED' }),
  remove: jest.fn().mockResolvedValue({}),
  createSession: jest.fn().mockResolvedValue({ id: 1 }),
  updateSession: jest.fn().mockResolvedValue({}),
  removeSession: jest.fn().mockResolvedValue({}),
  getSessionParticipants: jest.fn().mockResolvedValue([]),
  registerParticipant: jest.fn().mockResolvedValue({ id: 1 }),
  cancelParticipant: jest.fn().mockResolvedValue({}),
  updateParticipantStatus: jest.fn().mockResolvedValue({}),
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

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('myTrainings → getMyTrainings(userId)', async () => {
    await controller.myTrainings(mockUser as any);
    expect(mockSvc.getMyTrainings).toHaveBeenCalledWith(1);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(3);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3);
  });

  it('attendanceReport → getAttendanceReport(id)', async () => {
    await controller.attendanceReport(2);
    expect(mockSvc.getAttendanceReport).toHaveBeenCalledWith(2);
  });

  it('create → create(dto)', async () => {
    const dto = {} as any;
    await controller.create(dto);
    expect(mockSvc.create).toHaveBeenCalledWith(dto);
  });

  it('update → update(id, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto);
  });

  it('publish → publish(id)', async () => {
    await controller.publish(1);
    expect(mockSvc.publish).toHaveBeenCalledWith(1);
  });

  it('archive → archive(id)', async () => {
    await controller.archive(1);
    expect(mockSvc.archive).toHaveBeenCalledWith(1);
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('createSession → createSession(dto)', async () => {
    const dto = {} as any;
    await controller.createSession(dto);
    expect(mockSvc.createSession).toHaveBeenCalledWith(dto);
  });

  it('updateSession → updateSession(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateSession(2, dto);
    expect(mockSvc.updateSession).toHaveBeenCalledWith(2, dto);
  });

  it('removeSession → removeSession(id)', async () => {
    await controller.removeSession(3);
    expect(mockSvc.removeSession).toHaveBeenCalledWith(3);
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

  it('updateParticipantStatus → updateParticipantStatus(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateParticipantStatus(5, dto);
    expect(mockSvc.updateParticipantStatus).toHaveBeenCalledWith(5, dto);
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
