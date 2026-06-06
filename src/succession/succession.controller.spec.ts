import { Test, TestingModule } from '@nestjs/testing';
import { SuccessionController } from './succession.controller';
import { SuccessionService } from './succession.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getDashboard: jest.fn().mockResolvedValue({}),
  getCriticalPositions: jest.fn().mockResolvedValue([]),
  findOneCriticalPosition: jest.fn().mockResolvedValue({ id: 1 }),
  createCriticalPosition: jest.fn().mockResolvedValue({ id: 2 }),
  updateCriticalPosition: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getOrganizationChart: jest.fn().mockResolvedValue({}),
  getPositionSummary: jest.fn().mockResolvedValue({}),
  compareProfiles: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  remove: jest.fn().mockResolvedValue({}),
  getTalentPool: jest.fn().mockResolvedValue([]),
  addToTalentPool: jest.fn().mockResolvedValue({}),
  removeFromTalentPool: jest.fn().mockResolvedValue({}),
  generatePDI: jest.fn().mockResolvedValue({ id: 1 }),
};

describe('SuccessionController', () => {
  let controller: SuccessionController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SuccessionController],
      providers: [{ provide: SuccessionService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<SuccessionController>(SuccessionController);
  });

  it('dashboard → getDashboard', async () => {
    await controller.dashboard();
    expect(mockSvc.getDashboard).toHaveBeenCalled();
  });

  it('getCriticalPositions → getCriticalPositions(filters)', async () => {
    const filters = {} as any;
    await controller.getCriticalPositions(filters);
    expect(mockSvc.getCriticalPositions).toHaveBeenCalledWith(filters);
  });

  it('getCriticalPosition → findOneCriticalPosition(id)', async () => {
    await controller.getCriticalPosition(2);
    expect(mockSvc.findOneCriticalPosition).toHaveBeenCalledWith(2);
  });

  it('createCriticalPosition → createCriticalPosition(dto)', async () => {
    const dto = {} as any;
    await controller.createCriticalPosition(dto);
    expect(mockSvc.createCriticalPosition).toHaveBeenCalledWith(dto);
  });

  it('updateCriticalPosition → updateCriticalPosition(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateCriticalPosition(1, dto);
    expect(mockSvc.updateCriticalPosition).toHaveBeenCalledWith(1, dto);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('orgChart sem departmentId → getOrganizationChart(undefined)', async () => {
    await controller.orgChart();
    expect(mockSvc.getOrganizationChart).toHaveBeenCalledWith(undefined);
  });

  it('orgChart com departmentId → getOrganizationChart(parsed)', async () => {
    await controller.orgChart('3');
    expect(mockSvc.getOrganizationChart).toHaveBeenCalledWith(3);
  });

  it('positionSummary → getPositionSummary(id)', async () => {
    await controller.positionSummary(4);
    expect(mockSvc.getPositionSummary).toHaveBeenCalledWith(4);
  });

  it('compareProfiles → compareProfiles(parsed, parsed, parsed)', async () => {
    await controller.compareProfiles('2', '3', '5');
    expect(mockSvc.compareProfiles).toHaveBeenCalledWith(2, 3, 5);
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(1);
    expect(mockSvc.findOne).toHaveBeenCalledWith(1);
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

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('getTalentPool → getTalentPool', async () => {
    await controller.getTalentPool();
    expect(mockSvc.getTalentPool).toHaveBeenCalled();
  });

  it('addToTalentPool → addToTalentPool(dto)', async () => {
    const dto = {} as any;
    await controller.addToTalentPool(dto);
    expect(mockSvc.addToTalentPool).toHaveBeenCalledWith(dto);
  });

  it('removeFromTalentPool → removeFromTalentPool(userId)', async () => {
    await controller.removeFromTalentPool(5);
    expect(mockSvc.removeFromTalentPool).toHaveBeenCalledWith(5);
  });

  it('generatePDI → generatePDI(dto)', async () => {
    const dto = {} as any;
    await controller.generatePDI(dto);
    expect(mockSvc.generatePDI).toHaveBeenCalledWith(dto);
  });
});
