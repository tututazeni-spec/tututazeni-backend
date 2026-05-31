import { Test, TestingModule } from '@nestjs/testing';
import {
  DepartmentsController,
  UnitsController,
  RolesController,
  PositionsController,
  CareersController,
} from './departments.controller';
import {
  DepartmentsService,
  UnitsService,
  RolesService,
  PositionsService,
  CareersService,
} from './departments.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

// ─── DepartmentsController ─────────────────────────────────────────────────

const mockDeptSvc = {
  findAll: jest.fn().mockResolvedValue([]),
  getTree: jest.fn().mockResolvedValue([]),
  getComparativeDashboard: jest.fn().mockResolvedValue({}),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getMetrics: jest.fn().mockResolvedValue({}),
  getTransferHistory: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  deactivate: jest.fn().mockResolvedValue({}),
  activate: jest.fn().mockResolvedValue({}),
  transferMember: jest.fn().mockResolvedValue({}),
  bulkTransfer: jest.fn().mockResolvedValue({}),
};

describe('DepartmentsController', () => {
  let controller: DepartmentsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DepartmentsController],
      providers: [{ provide: DepartmentsService, useValue: mockDeptSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(DepartmentsController);
  });

  it('findAll', async () => {
    await controller.findAll({} as any);
    expect(mockDeptSvc.findAll).toHaveBeenCalled();
  });

  it('getTree', async () => {
    await controller.getTree();
    expect(mockDeptSvc.getTree).toHaveBeenCalled();
  });

  it('comparativeDashboard', async () => {
    await controller.comparativeDashboard();
    expect(mockDeptSvc.getComparativeDashboard).toHaveBeenCalled();
  });

  it('findOne', async () => {
    await controller.findOne(1);
    expect(mockDeptSvc.findOne).toHaveBeenCalledWith(1);
  });

  it('metrics', async () => {
    await controller.metrics(1);
    expect(mockDeptSvc.getMetrics).toHaveBeenCalledWith(1);
  });

  it('transferHistory sem page', async () => {
    await controller.transferHistory(1);
    expect(mockDeptSvc.getTransferHistory).toHaveBeenCalledWith(1, 1);
  });

  it('transferHistory com page', async () => {
    await controller.transferHistory(1, '2');
    expect(mockDeptSvc.getTransferHistory).toHaveBeenCalledWith(1, 2);
  });

  it('create', async () => {
    await controller.create({} as any);
    expect(mockDeptSvc.create).toHaveBeenCalled();
  });

  it('update', async () => {
    await controller.update(1, {} as any);
    expect(mockDeptSvc.update).toHaveBeenCalled();
  });

  it('deactivate', async () => {
    await controller.deactivate(1);
    expect(mockDeptSvc.deactivate).toHaveBeenCalledWith(1);
  });

  it('activate', async () => {
    await controller.activate(1);
    expect(mockDeptSvc.activate).toHaveBeenCalledWith(1);
  });

  it('transferMember', async () => {
    await controller.transferMember({} as any);
    expect(mockDeptSvc.transferMember).toHaveBeenCalled();
  });

  it('bulkTransfer', async () => {
    await controller.bulkTransfer({} as any);
    expect(mockDeptSvc.bulkTransfer).toHaveBeenCalled();
  });
});

// ─── UnitsController ────────────────────────────────────────────────────────

const mockUnitsSvc = {
  findAll: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 1 }),
  update: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue({}),
};

describe('UnitsController', () => {
  let controller: UnitsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnitsController],
      providers: [{ provide: UnitsService, useValue: mockUnitsSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(UnitsController);
  });

  it('findAll', async () => {
    await controller.findAll();
    expect(mockUnitsSvc.findAll).toHaveBeenCalled();
  });

  it('findOne', async () => {
    await controller.findOne(1);
    expect(mockUnitsSvc.findOne).toHaveBeenCalledWith(1);
  });

  it('create', async () => {
    await controller.create({} as any);
    expect(mockUnitsSvc.create).toHaveBeenCalled();
  });

  it('update', async () => {
    await controller.update(1, {} as any);
    expect(mockUnitsSvc.update).toHaveBeenCalled();
  });

  it('remove', async () => {
    await controller.remove(1);
    expect(mockUnitsSvc.remove).toHaveBeenCalledWith(1);
  });
});

// ─── RolesController ────────────────────────────────────────────────────────

const mockRolesSvc = {
  findAll: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 1 }),
  initDefaultRoles: jest.fn().mockResolvedValue([]),
  addPermission: jest.fn().mockResolvedValue({}),
  assignPermissionToRole: jest.fn().mockResolvedValue({}),
  revokePermissionFromRole: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue({}),
  removePermission: jest.fn().mockResolvedValue({}),
};

describe('RolesController', () => {
  let controller: RolesController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesController],
      providers: [{ provide: RolesService, useValue: mockRolesSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(RolesController);
  });

  it('findAll', async () => {
    await controller.findAll();
    expect(mockRolesSvc.findAll).toHaveBeenCalled();
  });

  it('findOne', async () => {
    await controller.findOne(1);
    expect(mockRolesSvc.findOne).toHaveBeenCalledWith(1);
  });

  it('create', async () => {
    await controller.create({} as any);
    expect(mockRolesSvc.create).toHaveBeenCalled();
  });

  it('initDefaults', async () => {
    await controller.initDefaults();
    expect(mockRolesSvc.initDefaultRoles).toHaveBeenCalled();
  });

  it('addPermission', async () => {
    await controller.addPermission({} as any);
    expect(mockRolesSvc.addPermission).toHaveBeenCalled();
  });

  it('assignPermission', async () => {
    await controller.assignPermission(1, 2);
    expect(mockRolesSvc.assignPermissionToRole).toHaveBeenCalledWith(1, 2);
  });

  it('revokePermission', async () => {
    await controller.revokePermission(1, 2);
    expect(mockRolesSvc.revokePermissionFromRole).toHaveBeenCalledWith(1, 2);
  });

  it('update', async () => {
    await controller.update(1, {} as any);
    expect(mockRolesSvc.update).toHaveBeenCalled();
  });

  it('remove', async () => {
    await controller.remove(1);
    expect(mockRolesSvc.remove).toHaveBeenCalledWith(1);
  });

  it('removePermission', async () => {
    await controller.removePermission(2);
    expect(mockRolesSvc.removePermission).toHaveBeenCalledWith(2);
  });
});

// ─── PositionsController ────────────────────────────────────────────────────

const mockPositionsSvc = {
  findAll: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 1 }),
  update: jest.fn().mockResolvedValue({}),
  remove: jest.fn().mockResolvedValue({}),
};

describe('PositionsController', () => {
  let controller: PositionsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PositionsController],
      providers: [{ provide: PositionsService, useValue: mockPositionsSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(PositionsController);
  });

  it('findAll', async () => {
    await controller.findAll();
    expect(mockPositionsSvc.findAll).toHaveBeenCalled();
  });

  it('findOne', async () => {
    await controller.findOne(1);
    expect(mockPositionsSvc.findOne).toHaveBeenCalledWith(1);
  });

  it('create', async () => {
    await controller.create({} as any);
    expect(mockPositionsSvc.create).toHaveBeenCalled();
  });

  it('update', async () => {
    await controller.update(1, {} as any);
    expect(mockPositionsSvc.update).toHaveBeenCalled();
  });

  it('remove', async () => {
    await controller.remove(1);
    expect(mockPositionsSvc.remove).toHaveBeenCalledWith(1);
  });
});

// ─── CareersController ───────────────────────────────────────────────────────

const mockCareersSvc = {
  getCareerLadder: jest.fn().mockResolvedValue([]),
  findAllPositions: jest.fn().mockResolvedValue([]),
  findOnePosition: jest.fn().mockResolvedValue({ id: 1 }),
  getUserCareerHistory: jest.fn().mockResolvedValue([]),
  createPosition: jest.fn().mockResolvedValue({ id: 1 }),
  assignCareerPosition: jest.fn().mockResolvedValue({}),
};

describe('CareersController', () => {
  let controller: CareersController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CareersController],
      providers: [{ provide: CareersService, useValue: mockCareersSvc }],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    controller = module.get(CareersController);
  });

  it('ladder', async () => {
    await controller.ladder();
    expect(mockCareersSvc.getCareerLadder).toHaveBeenCalled();
  });

  it('positions', async () => {
    await controller.positions();
    expect(mockCareersSvc.findAllPositions).toHaveBeenCalled();
  });

  it('position', async () => {
    await controller.position(1);
    expect(mockCareersSvc.findOnePosition).toHaveBeenCalledWith(1);
  });

  it('myHistory', async () => {
    await controller.myHistory(mockUser as any);
    expect(mockCareersSvc.getUserCareerHistory).toHaveBeenCalledWith(1);
  });

  it('userHistory', async () => {
    await controller.userHistory(2);
    expect(mockCareersSvc.getUserCareerHistory).toHaveBeenCalledWith(2);
  });

  it('createPosition', async () => {
    await controller.createPosition({} as any);
    expect(mockCareersSvc.createPosition).toHaveBeenCalled();
  });

  it('assign', async () => {
    await controller.assign(1, 2);
    expect(mockCareersSvc.assignCareerPosition).toHaveBeenCalledWith(1, 2);
  });
});
