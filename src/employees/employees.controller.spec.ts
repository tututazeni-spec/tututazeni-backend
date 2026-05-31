import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getHeadcountStats: jest.fn().mockResolvedValue({}),
  exportEmployees: jest.fn().mockResolvedValue([{ id: 1 }]),
  getOrgChart: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getEmployeeStats: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  remove: jest.fn().mockResolvedValue({ message: 'ok' }),
  getContracts: jest.fn().mockResolvedValue([]),
  createContract: jest.fn().mockResolvedValue({ id: 1 }),
  updateContractStatus: jest.fn().mockResolvedValue({}),
  getAttendance: jest.fn().mockResolvedValue([]),
  logAttendance: jest.fn().mockResolvedValue({}),
  getFeedback360: jest.fn().mockResolvedValue([]),
  addFeedback360: jest.fn().mockResolvedValue({}),
  getCareerPlans: jest.fn().mockResolvedValue([]),
  createCareerPlan: jest.fn().mockResolvedValue({ id: 1 }),
  updateCareerPlanStatus: jest.fn().mockResolvedValue({}),
  getPdis: jest.fn().mockResolvedValue([]),
  createPdi: jest.fn().mockResolvedValue({ id: 1 }),
  updatePdiProgress: jest.fn().mockResolvedValue({}),
  getEmployeeSkills: jest.fn().mockResolvedValue([]),
  assignSkill: jest.fn().mockResolvedValue({}),
  updateSkillLevel: jest.fn().mockResolvedValue({}),
  removeSkill: jest.fn().mockResolvedValue({}),
  getDocuments: jest.fn().mockResolvedValue([]),
  createDocument: jest.fn().mockResolvedValue({ id: 1 }),
  deleteDocument: jest.fn().mockResolvedValue({}),
  getTimeline: jest.fn().mockResolvedValue([]),
  addTimelineEvent: jest.fn().mockResolvedValue({}),
  getRequests: jest.fn().mockResolvedValue([]),
  createRequest: jest.fn().mockResolvedValue({ id: 1 }),
  reviewRequest: jest.fn().mockResolvedValue({}),
  bulkAssignCourses: jest.fn().mockResolvedValue({}),
  bulkUpdateStatus: jest.fn().mockResolvedValue({}),
  getAuditLog: jest.fn().mockResolvedValue([]),
};

const mockUser = { id: 1, email: 'admin@innova.com', role: { name: 'ADMIN' } };

describe('EmployeesController', () => {
  let controller: EmployeesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmployeesController],
      providers: [{ provide: EmployeesService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(EmployeesController);
  });

  it('findAll → findAll(filters)', async () => {
    await controller.findAll({} as any);
    expect(mockSvc.findAll).toHaveBeenCalled();
  });

  it('getHeadcount → getHeadcountStats', async () => {
    await controller.getHeadcount();
    expect(mockSvc.getHeadcountStats).toHaveBeenCalled();
  });

  it('exportAll → exportEmployees', async () => {
    const result = await controller.exportAll({} as any);
    expect(mockSvc.exportEmployees).toHaveBeenCalled();
    expect(result).toHaveProperty('count');
  });

  it('getOrgChart sem rootId', async () => {
    await controller.getOrgChart();
    expect(mockSvc.getOrgChart).toHaveBeenCalledWith(undefined);
  });

  it('getOrgChart com rootId', async () => {
    await controller.getOrgChart('5');
    expect(mockSvc.getOrgChart).toHaveBeenCalledWith(5);
  });

  it('findOne → findOne(id, userId)', async () => {
    await controller.findOne(1, mockUser as any);
    expect(mockSvc.findOne).toHaveBeenCalledWith(1, 1);
  });

  it('getStats → getEmployeeStats', async () => {
    await controller.getStats(1);
    expect(mockSvc.getEmployeeStats).toHaveBeenCalledWith(1);
  });

  it('create → create(dto, userId)', async () => {
    await controller.create({} as any, mockUser as any);
    expect(mockSvc.create).toHaveBeenCalledWith({}, 1);
  });

  it('update → update(id, dto, userId)', async () => {
    await controller.update(1, {} as any, mockUser as any);
    expect(mockSvc.update).toHaveBeenCalledWith(1, {}, 1);
  });

  it('remove → remove(id, userId)', async () => {
    await controller.remove(1, mockUser as any);
    expect(mockSvc.remove).toHaveBeenCalledWith(1, 1);
  });

  it('getContracts → getContracts', async () => {
    await controller.getContracts(1);
    expect(mockSvc.getContracts).toHaveBeenCalledWith(1);
  });

  it('createContract → createContract', async () => {
    await controller.createContract({} as any);
    expect(mockSvc.createContract).toHaveBeenCalled();
  });

  it('updateContractStatus → updateContractStatus', async () => {
    await controller.updateContractStatus(1, { status: 'ACTIVE' });
    expect(mockSvc.updateContractStatus).toHaveBeenCalledWith(1, 'ACTIVE');
  });

  it('getAttendance sem datas', async () => {
    await controller.getAttendance(1);
    expect(mockSvc.getAttendance).toHaveBeenCalledWith(1, undefined, undefined);
  });

  it('getAttendance com datas', async () => {
    await controller.getAttendance(1, '2024-01-01', '2024-01-31');
    expect(mockSvc.getAttendance).toHaveBeenCalledWith(1, '2024-01-01', '2024-01-31');
  });

  it('logAttendance', async () => {
    await controller.logAttendance({} as any);
    expect(mockSvc.logAttendance).toHaveBeenCalled();
  });

  it('getFeedback360 sem cycle', async () => {
    await controller.getFeedback360(1);
    expect(mockSvc.getFeedback360).toHaveBeenCalledWith(1, undefined);
  });

  it('addFeedback → addFeedback360', async () => {
    await controller.addFeedback({} as any);
    expect(mockSvc.addFeedback360).toHaveBeenCalled();
  });

  it('getCareerPlans', async () => {
    await controller.getCareerPlans(1);
    expect(mockSvc.getCareerPlans).toHaveBeenCalledWith(1);
  });

  it('createCareerPlan', async () => {
    await controller.createCareerPlan({} as any);
    expect(mockSvc.createCareerPlan).toHaveBeenCalled();
  });

  it('updateCareerPlanStatus', async () => {
    await controller.updateCareerPlanStatus(1, { status: 'COMPLETED' });
    expect(mockSvc.updateCareerPlanStatus).toHaveBeenCalledWith(1, 'COMPLETED');
  });

  it('getPdis', async () => {
    await controller.getPdis(1);
    expect(mockSvc.getPdis).toHaveBeenCalledWith(1);
  });

  it('createPdi', async () => {
    await controller.createPdi({} as any, mockUser as any);
    expect(mockSvc.createPdi).toHaveBeenCalledWith({}, 1);
  });

  it('updatePdiProgress', async () => {
    await controller.updatePdiProgress(1, {} as any);
    expect(mockSvc.updatePdiProgress).toHaveBeenCalledWith(1, {});
  });

  it('getSkills', async () => {
    await controller.getSkills(1);
    expect(mockSvc.getEmployeeSkills).toHaveBeenCalledWith(1);
  });

  it('assignSkill', async () => {
    const dto = { skillId: 1, level: 3 } as any;
    await controller.assignSkill(1, dto, mockUser as any);
    expect(mockSvc.assignSkill).toHaveBeenCalledWith({ skillId: 1, level: 3, employeeId: 1 }, 1);
  });

  it('updateSkillLevel', async () => {
    await controller.updateSkillLevel(1, 2, {} as any);
    expect(mockSvc.updateSkillLevel).toHaveBeenCalledWith(1, 2, {});
  });

  it('removeSkill', async () => {
    await controller.removeSkill(1, 2);
    expect(mockSvc.removeSkill).toHaveBeenCalledWith(1, 2);
  });

  it('getDocuments', async () => {
    await controller.getDocuments(1);
    expect(mockSvc.getDocuments).toHaveBeenCalledWith(1);
  });

  it('createDocument', async () => {
    const dto = { type: 'ID' } as any;
    await controller.createDocument(1, dto, mockUser as any);
    expect(mockSvc.createDocument).toHaveBeenCalledWith({ type: 'ID', employeeId: 1 }, 1);
  });

  it('deleteDocument', async () => {
    await controller.deleteDocument(1, mockUser as any);
    expect(mockSvc.deleteDocument).toHaveBeenCalledWith(1, 1);
  });

  it('getTimeline sem params', async () => {
    await controller.getTimeline(1);
    expect(mockSvc.getTimeline).toHaveBeenCalledWith(1, undefined, 50);
  });

  it('getTimeline com limit', async () => {
    await controller.getTimeline(1, 'COURSE', '10');
    expect(mockSvc.getTimeline).toHaveBeenCalledWith(1, 'COURSE', 10);
  });

  it('addTimelineEvent', async () => {
    const dto = { type: 'NOTE', description: 'test' } as any;
    await controller.addTimelineEvent(1, dto);
    expect(mockSvc.addTimelineEvent).toHaveBeenCalledWith({ type: 'NOTE', description: 'test', employeeId: 1 });
  });

  it('getRequests sem status', async () => {
    await controller.getRequests(1);
    expect(mockSvc.getRequests).toHaveBeenCalledWith(1, undefined);
  });

  it('createRequest', async () => {
    const dto = { type: 'DATA_CHANGE' } as any;
    await controller.createRequest(1, dto);
    expect(mockSvc.createRequest).toHaveBeenCalledWith({ type: 'DATA_CHANGE', employeeId: 1 });
  });

  it('reviewRequest', async () => {
    const dto = { decision: 'APPROVED' } as any;
    await controller.reviewRequest(1, dto);
    expect(mockSvc.reviewRequest).toHaveBeenCalledWith(1, dto);
  });

  it('bulkAssignCourses', async () => {
    await controller.bulkAssignCourses({} as any, mockUser as any);
    expect(mockSvc.bulkAssignCourses).toHaveBeenCalledWith({}, 1);
  });

  it('bulkUpdateStatus', async () => {
    await controller.bulkUpdateStatus({} as any, mockUser as any);
    expect(mockSvc.bulkUpdateStatus).toHaveBeenCalledWith({}, 1);
  });

  it('getAuditLog sem limit', async () => {
    await controller.getAuditLog(1);
    expect(mockSvc.getAuditLog).toHaveBeenCalledWith(1, 50);
  });

  it('getAuditLog com limit', async () => {
    await controller.getAuditLog(1, '20');
    expect(mockSvc.getAuditLog).toHaveBeenCalledWith(1, 20);
  });
});
