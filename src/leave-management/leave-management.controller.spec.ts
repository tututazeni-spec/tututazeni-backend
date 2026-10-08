import { Test, TestingModule } from '@nestjs/testing';
import { LeaveManagementController } from './leave-management.controller';
import { LeaveManagementService } from './leave-management.service';
import { LeaveOverviewService } from './leave-overview.service';
import { LeaveLicensesService } from './leave-licenses.service';
import { LeaveAbsenceCalendarService } from './leave-absence-calendar.service';
import { LeaveApprovalsService } from './leave-approvals.service';
import { LeavePlanningService } from './leave-planning.service';
import { LeaveReportsService } from './leave-reports.service';
import { LeaveEffectsService } from './leave-effects.service';
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

const mockOverview = {
  getOverview: jest.fn().mockResolvedValue({}),
  getVacations: jest.fn().mockResolvedValue({}),
  previewDuration: jest.fn().mockResolvedValue({}),
};

const mockLicenses = {
  list: jest.fn().mockResolvedValue({ data: [] }),
  approvalRoute: jest.fn().mockResolvedValue({ steps: [] }),
};

const mockAbsenceCalendar = {
  getCalendar: jest.fn().mockResolvedValue({}),
  exportCsv: jest.fn().mockResolvedValue({}),
};

const mockEffects = { payrollFeed: jest.fn().mockResolvedValue({ leaves: [], absences: [] }) };

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('LeaveManagementController', () => {
  let controller: LeaveManagementController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LeaveManagementController],
      providers: [
        { provide: LeaveManagementService, useValue: mockSvc },
        { provide: LeaveOverviewService, useValue: mockOverview },
        { provide: LeaveLicensesService, useValue: mockLicenses },
        { provide: LeaveAbsenceCalendarService, useValue: mockAbsenceCalendar },
        { provide: LeaveApprovalsService, useValue: {} },
        { provide: LeavePlanningService, useValue: {} },
        { provide: LeaveReportsService, useValue: {} },
        { provide: LeaveEffectsService, useValue: mockEffects },
      ],
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
    await controller.checkConflicts('5', '2024-06-01', '2024-06-10', mockUser as any);
    expect(mockSvc.getConflictCheck).toHaveBeenCalledWith(5, '2024-06-01', '2024-06-10');
  });

  // A10-23: sem ownership, qualquer autenticado podia sondar se um colega
  // tinha férias marcadas num período arbitrário.
  it('checkConflicts rejeita colaborador a sondar férias de outro utilizador', () => {
    const colaborador = { id: 2, email: 'c@innova.com', role: { name: 'COLABORADOR' } };
    expect(() =>
      controller.checkConflicts('5', '2024-06-01', '2024-06-10', colaborador as any),
    ).toThrow();
    expect(mockSvc.getConflictCheck).not.toHaveBeenCalledWith(5, '2024-06-01', '2024-06-10');
  });

  it('checkConflicts permite colaborador sondar as suas próprias férias', async () => {
    const colaborador = { id: 5, email: 'c@innova.com', role: { name: 'COLABORADOR' } };
    await controller.checkConflicts('5', '2024-06-01', '2024-06-10', colaborador as any);
    expect(mockSvc.getConflictCheck).toHaveBeenCalledWith(5, '2024-06-01', '2024-06-10');
  });

  it('getPendingApprovals → getPendingApprovals(userId)', async () => {
    await controller.getPendingApprovals(mockUser as any);
    expect(mockSvc.getPendingApprovals).toHaveBeenCalledWith(1, mockUser);
  });

  it('myRequests → findAll com userId', async () => {
    const filters = {} as any;
    await controller.myRequests(mockUser as any, filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith({ ...filters, userId: 1 }, mockUser);
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
    await controller.findAll(filters, mockUser as any);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters, mockUser);
  });

  it('findOne → findOne(id, user)', async () => {
    await controller.findOne(3, mockUser as any);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3, mockUser as any);
  });

  it('create → create(dto, userId)', async () => {
    const dto = {} as any;
    await controller.create(dto, mockUser as any);
    expect(mockSvc.create).toHaveBeenCalledWith(dto, 1);
  });

  it('create → colaborador não pode submeter em nome de outro', async () => {
    const employee = { id: 7, email: 'e@innova.com', role: { name: 'COLABORADOR' } };
    await expect(async () =>
      controller.create({ userId: 8 } as any, employee as any),
    ).rejects.toThrow();
    expect(mockSvc.create).not.toHaveBeenCalled();
  });

  it('overview / vacations / duration-preview delegam em LeaveOverviewService', async () => {
    await controller.getOverview({} as any, mockUser as any);
    await controller.getVacations({} as any, mockUser as any);
    await controller.previewDuration({} as any, mockUser as any);
    expect(mockOverview.getOverview).toHaveBeenCalledWith({}, mockUser);
    expect(mockOverview.getVacations).toHaveBeenCalledWith({}, mockUser);
    expect(mockOverview.previewDuration).toHaveBeenCalledWith({}, mockUser);
  });

  it('licenses / approval-route delegam em LeaveLicensesService', async () => {
    await controller.getLicenses({} as any, mockUser as any);
    await controller.getApprovalRoute({ leaveTypeCode: 'SICK' } as any, mockUser as any);
    expect(mockLicenses.list).toHaveBeenCalledWith({}, mockUser);
    expect(mockLicenses.approvalRoute).toHaveBeenCalledWith({ leaveTypeCode: 'SICK' }, mockUser);
  });

  it('absence-calendar (+ export) delegam em LeaveAbsenceCalendarService', async () => {
    await controller.getAbsenceCalendar({} as any, mockUser as any);
    await controller.exportAbsenceCalendar({} as any, mockUser as any);
    expect(mockAbsenceCalendar.getCalendar).toHaveBeenCalledWith({}, mockUser);
    expect(mockAbsenceCalendar.exportCsv).toHaveBeenCalledWith({}, mockUser);
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

  it('cancel → cancel(id, userId, { reason, actor })', async () => {
    await controller.cancel(5, mockUser as any, { reason: 'Mudança de planos' });
    expect(mockSvc.cancel).toHaveBeenCalledWith(5, 1, {
      reason: 'Mudança de planos',
      actor: mockUser,
    });
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

  it('processCarryOver → processCarryOver(year, actorId)', async () => {
    await controller.processCarryOver('2024', mockUser as any);
    expect(mockSvc.processCarryOver).toHaveBeenCalledWith(2024, 1);
  });
});
