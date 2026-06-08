import { Test, TestingModule } from '@nestjs/testing';
import { LeaveManagementController } from './leave-management.controller';
import { LeaveManagementService } from './leave-management.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getLeaveTypes: jest.fn().mockResolvedValue([]),
  createLeaveType: jest.fn().mockResolvedValue({ code: 'ANNUAL' }),
  updateLeaveType: jest.fn().mockResolvedValue({}),
  getPolicies: jest.fn().mockResolvedValue([]),
  createPolicy: jest.fn().mockResolvedValue({ id: 1 }),
  getDashboard: jest.fn().mockResolvedValue({}),
  getAbsenteeismReport: jest.fn().mockResolvedValue({}),
  getCalendar: jest.fn().mockResolvedValue([]),
  getConflictCheck: jest.fn().mockResolvedValue({ conflicts: [] }),
  getPendingApprovals: jest.fn().mockResolvedValue([]),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getBalance: jest.fn().mockResolvedValue({}),
  getBalanceHistory: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  processApproval: jest.fn().mockResolvedValue({}),
  bulkApprove: jest.fn().mockResolvedValue({ approved: 0 }),
  cancel: jest.fn().mockResolvedValue({}),
  updateBalance: jest.fn().mockResolvedValue({}),
  accrueBalance: jest.fn().mockResolvedValue({}),
  initializeUserBalances: jest.fn().mockResolvedValue({}),
  processCarryOver: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('LeaveManagementController', () => {
  let controller: LeaveManagementController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaveManagementController],
      providers: [{ provide: LeaveManagementService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<LeaveManagementController>(LeaveManagementController);
  });

  it('getTypes sem activeOnly → getLeaveTypes(true)', async () => {
    await controller.getTypes();
    expect(mockSvc.getLeaveTypes).toHaveBeenCalledWith(true);
  });

  it('getTypes com activeOnly=false → getLeaveTypes(false)', async () => {
    await controller.getTypes('false');
    expect(mockSvc.getLeaveTypes).toHaveBeenCalledWith(false);
  });

  it('createType → createLeaveType(dto)', async () => {
    const dto = {} as any;
    await controller.createType(dto);
    expect(mockSvc.createLeaveType).toHaveBeenCalledWith(dto);
  });

  it('updateType → updateLeaveType(code, dto)', async () => {
    const dto = {} as any;
    await controller.updateType('ANNUAL', dto);
    expect(mockSvc.updateLeaveType).toHaveBeenCalledWith('ANNUAL', dto);
  });

  it('getPolicies → getPolicies', async () => {
    await controller.getPolicies();
    expect(mockSvc.getPolicies).toHaveBeenCalled();
  });

  it('createPolicy → createPolicy(dto)', async () => {
    const dto = {} as any;
    await controller.createPolicy(dto);
    expect(mockSvc.createPolicy).toHaveBeenCalledWith(dto);
  });

  it('getDashboard sem department → getDashboard(undefined)', async () => {
    await controller.getDashboard();
    expect(mockSvc.getDashboard).toHaveBeenCalledWith(undefined);
  });

  it('getDashboard com department → getDashboard(dept)', async () => {
    await controller.getDashboard('IT');
    expect(mockSvc.getDashboard).toHaveBeenCalledWith('IT');
  });

  it('getAbsenteeism → getAbsenteeismReport', async () => {
    await controller.getAbsenteeism('2024-01-01', '2024-12-31');
    expect(mockSvc.getAbsenteeismReport).toHaveBeenCalledWith(
      '2024-01-01',
      '2024-12-31',
      undefined,
    );
  });

  it('getCalendar → getCalendar(filters)', async () => {
    const filters = {} as any;
    await controller.getCalendar(filters);
    expect(mockSvc.getCalendar).toHaveBeenCalledWith(filters);
  });

  it('checkConflicts → getConflictCheck(userId, dates)', async () => {
    await controller.checkConflicts('5', '2024-06-01', '2024-06-10');
    expect(mockSvc.getConflictCheck).toHaveBeenCalledWith(5, '2024-06-01', '2024-06-10');
  });

  it('getPendingApprovals → getPendingApprovals(userId)', async () => {
    await controller.getPendingApprovals(mockUser as any);
    expect(mockSvc.getPendingApprovals).toHaveBeenCalledWith(1);
  });

  it('myRequests → findAll com userId', async () => {
    const filters = {} as any;
    await controller.myRequests(mockUser as any, filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith({ ...filters, userId: 1 });
  });

  it('myBalance → getBalance(userId)', async () => {
    await controller.myBalance(mockUser as any);
    expect(mockSvc.getBalance).toHaveBeenCalledWith(1);
  });

  it('myBalanceHistory → getBalanceHistory(userId)', async () => {
    await controller.myBalanceHistory(mockUser as any);
    expect(mockSvc.getBalanceHistory).toHaveBeenCalledWith(1, undefined);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(3);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3);
  });

  it('create → create(dto, userId)', async () => {
    const dto = {} as any;
    await controller.create(dto, mockUser as any);
    expect(mockSvc.create).toHaveBeenCalledWith(dto, 1);
  });

  it('approve → processApproval(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.approve(4, mockUser as any, dto);
    expect(mockSvc.processApproval).toHaveBeenCalledWith(4, 1, dto);
  });

  it('bulkApprove → bulkApprove(dto, userId)', async () => {
    const dto = {} as any;
    await controller.bulkApprove(dto, mockUser as any);
    expect(mockSvc.bulkApprove).toHaveBeenCalledWith(dto, 1);
  });

  it('cancel → cancel(id, userId)', async () => {
    await controller.cancel(5, mockUser as any);
    expect(mockSvc.cancel).toHaveBeenCalledWith(5, 1);
  });

  it('getBalance → getBalance(userId)', async () => {
    await controller.getBalance(3);
    expect(mockSvc.getBalance).toHaveBeenCalledWith(3);
  });

  it('updateBalance → updateBalance(userId, dto, adminId)', async () => {
    const dto = {} as any;
    await controller.updateBalance(3, dto, mockUser as any);
    expect(mockSvc.updateBalance).toHaveBeenCalledWith(3, dto, 1);
  });

  it('accrueBalance → accrueBalance(dto, userId)', async () => {
    const dto = {} as any;
    await controller.accrueBalance(dto, mockUser as any);
    expect(mockSvc.accrueBalance).toHaveBeenCalledWith(dto, 1);
  });

  it('initBalance → initializeUserBalances(userId)', async () => {
    await controller.initBalance(5);
    expect(mockSvc.initializeUserBalances).toHaveBeenCalledWith(5);
  });

  it('processCarryOver → processCarryOver(year)', async () => {
    await controller.processCarryOver('2024');
    expect(mockSvc.processCarryOver).toHaveBeenCalledWith(2024);
  });
});
