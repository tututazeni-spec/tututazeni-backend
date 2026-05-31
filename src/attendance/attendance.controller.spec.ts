import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getDashboard: jest.fn().mockResolvedValue({}),
  getMonthlyReport: jest.fn().mockResolvedValue({}),
  getAbsenteeismReport: jest.fn().mockResolvedValue({}),
  getKpiTrend: jest.fn().mockResolvedValue([]),
  clockIn: jest.fn().mockResolvedValue({ id: 1 }),
  clockOut: jest.fn().mockResolvedValue({ id: 1 }),
  findByUser: jest.fn().mockResolvedValue([]),
  getLeaveBalance: jest.fn().mockResolvedValue({}),
  getOvertimeBalance: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 1 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  remove: jest.fn().mockResolvedValue({}),
  getLeaves: jest.fn().mockResolvedValue([]),
  createLeaveRequest: jest.fn().mockResolvedValue({ id: 1 }),
  reviewLeave: jest.fn().mockResolvedValue({}),
  getWorkSchedules: jest.fn().mockResolvedValue([]),
  createWorkSchedule: jest.fn().mockResolvedValue({ id: 1 }),
  assignSchedule: jest.fn().mockResolvedValue({}),
  createOvertime: jest.fn().mockResolvedValue({ id: 1 }),
  reviewOvertime: jest.fn().mockResolvedValue({}),
  getPendingJustifications: jest.fn().mockResolvedValue([]),
  createJustification: jest.fn().mockResolvedValue({ id: 1 }),
  reviewJustification: jest.fn().mockResolvedValue({}),
  generateQrCode: jest.fn().mockResolvedValue({ token: 'qr123' }),
  checkInToEvent: jest.fn().mockResolvedValue({}),
  checkInToSession: jest.fn().mockResolvedValue({}),
  getEventAttendance: jest.fn().mockResolvedValue([]),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('AttendanceController', () => {
  let controller: AttendanceController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [{ provide: AttendanceService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AttendanceController);
  });

  it('getDashboard sem department', async () => {
    await controller.getDashboard();
    expect(mockSvc.getDashboard).toHaveBeenCalledWith(undefined);
  });

  it('getDashboard com department', async () => {
    await controller.getDashboard('TI');
    expect(mockSvc.getDashboard).toHaveBeenCalledWith('TI');
  });

  it('getMonthlyReport', async () => {
    await controller.getMonthlyReport('2024', '1', 'TI');
    expect(mockSvc.getMonthlyReport).toHaveBeenCalledWith(2024, 1, 'TI');
  });

  it('getAbsenteeism', async () => {
    await controller.getAbsenteeism('2024-01-01', '2024-01-31');
    expect(mockSvc.getAbsenteeismReport).toHaveBeenCalledWith('2024-01-01', '2024-01-31', undefined);
  });

  it('getKpiTrend sem params', async () => {
    await controller.getKpiTrend();
    expect(mockSvc.getKpiTrend).toHaveBeenCalledWith(undefined, 30);
  });

  it('getKpiTrend com params', async () => {
    await controller.getKpiTrend('5', '7');
    expect(mockSvc.getKpiTrend).toHaveBeenCalledWith(5, 7);
  });

  it('clockIn', async () => {
    const dto = { method: 'MANUAL' } as any;
    await controller.clockIn(mockUser as any, dto);
    expect(mockSvc.clockIn).toHaveBeenCalledWith(1, dto);
  });

  it('clockOut', async () => {
    const dto = { notes: 'ok' } as any;
    await controller.clockOut(mockUser as any, dto);
    expect(mockSvc.clockOut).toHaveBeenCalledWith(1, dto);
  });

  it('myAttendance sem datas', async () => {
    await controller.myAttendance(mockUser as any);
    expect(mockSvc.findByUser).toHaveBeenCalledWith(1, undefined, undefined);
  });

  it('myLeaveBalance', async () => {
    await controller.myLeaveBalance(mockUser as any);
    expect(mockSvc.getLeaveBalance).toHaveBeenCalledWith(1);
  });

  it('myOvertimeBalance', async () => {
    await controller.myOvertimeBalance(mockUser as any);
    expect(mockSvc.getOvertimeBalance).toHaveBeenCalledWith(1);
  });

  it('findAll', async () => {
    await controller.findAll({} as any);
    expect(mockSvc.findAll).toHaveBeenCalled();
  });

  it('findOne', async () => {
    await controller.findOne(1);
    expect(mockSvc.findOne).toHaveBeenCalledWith(1);
  });

  it('byUser', async () => {
    await controller.byUser(2, '2024-01-01', '2024-01-31');
    expect(mockSvc.findByUser).toHaveBeenCalledWith(2, '2024-01-01', '2024-01-31');
  });

  it('create', async () => {
    await controller.create({} as any);
    expect(mockSvc.create).toHaveBeenCalled();
  });

  it('update', async () => {
    await controller.update(1, {} as any, mockUser as any);
    expect(mockSvc.update).toHaveBeenCalledWith(1, {}, 1);
  });

  it('remove', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('getLeaves', async () => {
    await controller.getLeaves({} as any);
    expect(mockSvc.getLeaves).toHaveBeenCalled();
  });

  it('getPendingLeaves', async () => {
    await controller.getPendingLeaves();
    expect(mockSvc.getLeaves).toHaveBeenCalledWith({ status: 'PENDING' });
  });

  it('createLeave', async () => {
    const dto = { type: 'VACATION' } as any;
    await controller.createLeave(mockUser as any, dto);
    expect(mockSvc.createLeaveRequest).toHaveBeenCalledWith(1, dto);
  });

  it('reviewLeave', async () => {
    const dto = { decision: 'APPROVED' } as any;
    await controller.reviewLeave(1, dto, mockUser as any);
    expect(mockSvc.reviewLeave).toHaveBeenCalledWith(1, dto, 1);
  });

  it('getLeaveBalance', async () => {
    await controller.getLeaveBalance(2);
    expect(mockSvc.getLeaveBalance).toHaveBeenCalledWith(2);
  });

  it('getSchedules', async () => {
    await controller.getSchedules();
    expect(mockSvc.getWorkSchedules).toHaveBeenCalled();
  });

  it('createSchedule', async () => {
    await controller.createSchedule({} as any);
    expect(mockSvc.createWorkSchedule).toHaveBeenCalled();
  });

  it('assignSchedule', async () => {
    await controller.assignSchedule({} as any);
    expect(mockSvc.assignSchedule).toHaveBeenCalled();
  });

  it('createOvertime', async () => {
    const dto = { hours: 2 } as any;
    await controller.createOvertime(mockUser as any, dto);
    expect(mockSvc.createOvertime).toHaveBeenCalledWith(1, dto);
  });

  it('reviewOvertime', async () => {
    const dto = { decision: 'APPROVED' } as any;
    await controller.reviewOvertime(1, dto, mockUser as any);
    expect(mockSvc.reviewOvertime).toHaveBeenCalledWith(1, dto, 1);
  });

  it('getPendingJustifications', async () => {
    await controller.getPendingJustifications(mockUser as any);
    expect(mockSvc.getPendingJustifications).toHaveBeenCalledWith(1);
  });

  it('createJustification', async () => {
    const dto = { reason: 'sick' } as any;
    await controller.createJustification(mockUser as any, dto);
    expect(mockSvc.createJustification).toHaveBeenCalledWith(1, dto);
  });

  it('reviewJustification', async () => {
    const dto = { decision: 'APPROVED' } as any;
    await controller.reviewJustification(1, dto, mockUser as any);
    expect(mockSvc.reviewJustification).toHaveBeenCalledWith(1, dto, 1);
  });

  it('generateQr', async () => {
    const dto = { eventId: 1 } as any;
    await controller.generateQr(mockUser as any, dto);
    expect(mockSvc.generateQrCode).toHaveBeenCalledWith(1, dto);
  });

  it('validateQr → clockIn com QR_DYNAMIC', async () => {
    const dto = { token: 'abc', location: null, deviceInfo: null } as any;
    await controller.validateQr(mockUser as any, dto);
    expect(mockSvc.clockIn).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ method: 'QR_DYNAMIC', qrToken: 'abc' }),
    );
  });

  it('checkInEvent', async () => {
    const dto = { method: 'MANUAL' } as any;
    await controller.checkInEvent(mockUser as any, 5, dto);
    expect(mockSvc.checkInToEvent).toHaveBeenCalledWith(1, 5, dto);
  });

  it('checkInSession', async () => {
    const dto = { method: 'MANUAL' } as any;
    await controller.checkInSession(mockUser as any, 3, dto);
    expect(mockSvc.checkInToSession).toHaveBeenCalledWith(1, 3, dto);
  });

  it('getEventAttendance', async () => {
    await controller.getEventAttendance(5);
    expect(mockSvc.getEventAttendance).toHaveBeenCalledWith(5);
  });
});
