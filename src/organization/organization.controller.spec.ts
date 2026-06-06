import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationController } from './organization.controller';
import { OrganizationService } from './organization.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getStats: jest.fn().mockResolvedValue({}),
  getHeadcountByDepartment: jest.fn().mockResolvedValue([]),
  getSpanOfControlReport: jest.fn().mockResolvedValue([]),
  getOrgChart: jest.fn().mockResolvedValue({}),
  getOrgTimeline: jest.fn().mockResolvedValue([]),
  recordOrgChange: jest.fn().mockResolvedValue({ id: 1 }),
  getUserOrgHistory: jest.fn().mockResolvedValue([]),
  getUserOrgProfile: jest.fn().mockResolvedValue({}),
  getDepartments: jest.fn().mockResolvedValue([]),
  getDepartmentDetails: jest.fn().mockResolvedValue({ id: 1 }),
  createDepartment: jest.fn().mockResolvedValue({ id: 2 }),
  updateDepartment: jest.fn().mockResolvedValue({ id: 1 }),
  deleteDepartment: jest.fn().mockResolvedValue({}),
  getPositions: jest.fn().mockResolvedValue([]),
  createPosition: jest.fn().mockResolvedValue({ id: 1 }),
  updatePosition: jest.fn().mockResolvedValue({ id: 1 }),
  deletePosition: jest.fn().mockResolvedValue({}),
  getUnits: jest.fn().mockResolvedValue([]),
  createUnit: jest.fn().mockResolvedValue({ id: 1 }),
  updateUnit: jest.fn().mockResolvedValue({ id: 1 }),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('OrganizationController', () => {
  let controller: OrganizationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationController],
      providers: [{ provide: OrganizationService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<OrganizationController>(OrganizationController);
  });

  it('stats → getStats', async () => {
    await controller.stats();
    expect(mockSvc.getStats).toHaveBeenCalled();
  });

  it('headcount → getHeadcountByDepartment', async () => {
    await controller.headcount();
    expect(mockSvc.getHeadcountByDepartment).toHaveBeenCalled();
  });

  it('spanOfControl → getSpanOfControlReport', async () => {
    await controller.spanOfControl();
    expect(mockSvc.getSpanOfControlReport).toHaveBeenCalled();
  });

  it('chart → getOrgChart(filters)', async () => {
    const filters = {} as any;
    await controller.chart(filters);
    expect(mockSvc.getOrgChart).toHaveBeenCalledWith(filters);
  });

  it('timeline sem datas → getOrgTimeline(undefined, undefined)', async () => {
    await controller.timeline();
    expect(mockSvc.getOrgTimeline).toHaveBeenCalledWith(undefined, undefined);
  });

  it('recordChange → recordOrgChange(dto, userId)', async () => {
    const dto = {} as any;
    await controller.recordChange(mockUser as any, dto);
    expect(mockSvc.recordOrgChange).toHaveBeenCalledWith(dto, 1);
  });

  it('userHistory → getUserOrgHistory(userId)', async () => {
    await controller.userHistory(3);
    expect(mockSvc.getUserOrgHistory).toHaveBeenCalledWith(3);
  });

  it('userOrgProfile → getUserOrgProfile(userId)', async () => {
    await controller.userOrgProfile(4);
    expect(mockSvc.getUserOrgProfile).toHaveBeenCalledWith(4);
  });

  it('getDepartments → getDepartments(filters)', async () => {
    const filters = {} as any;
    await controller.getDepartments(filters);
    expect(mockSvc.getDepartments).toHaveBeenCalledWith(filters);
  });

  it('getDepartment → getDepartmentDetails(id)', async () => {
    await controller.getDepartment(2);
    expect(mockSvc.getDepartmentDetails).toHaveBeenCalledWith(2);
  });

  it('createDepartment → createDepartment(dto)', async () => {
    const dto = {} as any;
    await controller.createDepartment(dto);
    expect(mockSvc.createDepartment).toHaveBeenCalledWith(dto);
  });

  it('updateDepartment → updateDepartment(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateDepartment(1, dto);
    expect(mockSvc.updateDepartment).toHaveBeenCalledWith(1, dto);
  });

  it('deleteDepartment → deleteDepartment(id)', async () => {
    await controller.deleteDepartment(1);
    expect(mockSvc.deleteDepartment).toHaveBeenCalledWith(1);
  });

  it('getPositions → getPositions(filters)', async () => {
    const filters = {} as any;
    await controller.getPositions(filters);
    expect(mockSvc.getPositions).toHaveBeenCalledWith(filters);
  });

  it('createPosition → createPosition(dto)', async () => {
    const dto = {} as any;
    await controller.createPosition(dto);
    expect(mockSvc.createPosition).toHaveBeenCalledWith(dto);
  });

  it('updatePosition → updatePosition(id, dto)', async () => {
    const dto = {} as any;
    await controller.updatePosition(1, dto);
    expect(mockSvc.updatePosition).toHaveBeenCalledWith(1, dto);
  });

  it('deletePosition → deletePosition(id)', async () => {
    await controller.deletePosition(2);
    expect(mockSvc.deletePosition).toHaveBeenCalledWith(2);
  });

  it('getUnits → getUnits', async () => {
    await controller.getUnits();
    expect(mockSvc.getUnits).toHaveBeenCalled();
  });

  it('createUnit → createUnit(dto)', async () => {
    const dto = {} as any;
    await controller.createUnit(dto);
    expect(mockSvc.createUnit).toHaveBeenCalledWith(dto);
  });

  it('updateUnit → updateUnit(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateUnit(1, dto);
    expect(mockSvc.updateUnit).toHaveBeenCalledWith(1, dto);
  });
});
