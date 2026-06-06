import { Test, TestingModule } from '@nestjs/testing';
import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getMyPayslips: jest.fn().mockResolvedValue([]),
  annualSummary: jest.fn().mockResolvedValue({}),
  compare: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  logAccess: jest.fn().mockResolvedValue({}),
  acknowledge: jest.fn().mockResolvedValue({}),
  createDispute: jest.fn().mockResolvedValue({ id: 1 }),
  simulate: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  hrDashboard: jest.fn().mockResolvedValue({}),
  getAccessLogs: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  bulkCreate: jest.fn().mockResolvedValue({ created: 0 }),
  issue: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({ id: 1 }),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };
const mockReq = { ip: '127.0.0.1' } as any;

describe('PayslipsController', () => {
  let controller: PayslipsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PayslipsController],
      providers: [{ provide: PayslipsService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<PayslipsController>(PayslipsController);
  });

  it('myPayslips → getMyPayslips(userId, filters)', async () => {
    const filters = {} as any;
    await controller.myPayslips(mockUser as any, filters);
    expect(mockSvc.getMyPayslips).toHaveBeenCalledWith(1, filters);
  });

  it('myAnnualSummary → annualSummary(userId, year)', async () => {
    await controller.myAnnualSummary(mockUser as any, '2024');
    expect(mockSvc.annualSummary).toHaveBeenCalledWith(1, '2024');
  });

  it('myCompare → compare(userId, periodA, periodB)', async () => {
    await controller.myCompare(mockUser as any, '2024-01', '2024-02');
    expect(mockSvc.compare).toHaveBeenCalledWith(1, '2024-01', '2024-02');
  });

  it('myPayslip → findOne + logAccess', async () => {
    await controller.myPayslip(3, mockUser as any, mockReq);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3, 1, mockUser.role);
    expect(mockSvc.logAccess).toHaveBeenCalledWith(3, 1, 'VIEW', '127.0.0.1');
  });

  it('acknowledge → acknowledge(id, userId)', async () => {
    await controller.acknowledge(5, mockUser as any);
    expect(mockSvc.acknowledge).toHaveBeenCalledWith(5, 1);
  });

  it('createDispute → createDispute(id, userId, dto)', async () => {
    const dto = {} as any;
    await controller.createDispute(4, mockUser as any, dto);
    expect(mockSvc.createDispute).toHaveBeenCalledWith(4, 1, dto);
  });

  it('simulate → simulate(dto)', async () => {
    const dto = {} as any;
    await controller.simulate(dto);
    expect(mockSvc.simulate).toHaveBeenCalledWith(dto);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('hrDashboard sem period → hrDashboard(undefined)', async () => {
    await controller.hrDashboard();
    expect(mockSvc.hrDashboard).toHaveBeenCalledWith(undefined);
  });

  it('findOne (admin) → findOne + logAccess(ADMIN_VIEW)', async () => {
    await controller.findOne(2, mockUser as any, mockReq);
    expect(mockSvc.findOne).toHaveBeenCalledWith(2);
    expect(mockSvc.logAccess).toHaveBeenCalledWith(2, 1, 'ADMIN_VIEW', '127.0.0.1');
  });

  it('accessLogs → getAccessLogs(id)', async () => {
    await controller.accessLogs(3);
    expect(mockSvc.getAccessLogs).toHaveBeenCalledWith(3);
  });

  it('create → create(dto)', async () => {
    const dto = {} as any;
    await controller.create(dto);
    expect(mockSvc.create).toHaveBeenCalledWith(dto);
  });

  it('bulkCreate → bulkCreate(dto)', async () => {
    const dto = {} as any;
    await controller.bulkCreate(dto);
    expect(mockSvc.bulkCreate).toHaveBeenCalledWith(dto);
  });

  it('issue → issue(id)', async () => {
    await controller.issue(4);
    expect(mockSvc.issue).toHaveBeenCalledWith(4);
  });

  it('update → update(id, dto)', async () => {
    const dto = {} as any;
    await controller.update(1, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto);
  });
});
