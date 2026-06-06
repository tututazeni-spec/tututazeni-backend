import { Test, TestingModule } from '@nestjs/testing';
import { RolesPermissionsController } from './roles-permissions.controller';
import { RolesPermissionsService } from './roles-permissions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findAll: jest.fn().mockResolvedValue([]),
  getGovernanceStats: jest.fn().mockResolvedValue({}),
  getPermissionMatrix: jest.fn().mockResolvedValue([]),
  getUsersWithoutRole: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  getUsersWithRole: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  cloneRole: jest.fn().mockResolvedValue({ id: 3 }),
  remove: jest.fn().mockResolvedValue({}),
  assignToUser: jest.fn().mockResolvedValue({}),
  bulkAssignRole: jest.fn().mockResolvedValue({}),
  addPermissionsToRole: jest.fn().mockResolvedValue({}),
  removePermissionsFromRole: jest.fn().mockResolvedValue({}),
  setRolePermissions: jest.fn().mockResolvedValue({}),
  compareRoles: jest.fn().mockResolvedValue({}),
  simulatePermission: jest.fn().mockResolvedValue({ allowed: true }),
  getPositionTemplates: jest.fn().mockResolvedValue([]),
  createPositionTemplate: jest.fn().mockResolvedValue({ id: 1 }),
  applyPositionTemplate: jest.fn().mockResolvedValue({}),
};

describe('RolesPermissionsController', () => {
  let controller: RolesPermissionsController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RolesPermissionsController],
      providers: [{ provide: RolesPermissionsService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<RolesPermissionsController>(RolesPermissionsController);
  });

  it('findAll → findAll', async () => {
    await controller.findAll();
    expect(mockSvc.findAll).toHaveBeenCalled();
  });

  it('governance → getGovernanceStats', async () => {
    await controller.governance();
    expect(mockSvc.getGovernanceStats).toHaveBeenCalled();
  });

  it('matrix → getPermissionMatrix', async () => {
    await controller.matrix();
    expect(mockSvc.getPermissionMatrix).toHaveBeenCalled();
  });

  it('withoutRole → getUsersWithoutRole', async () => {
    await controller.withoutRole();
    expect(mockSvc.getUsersWithoutRole).toHaveBeenCalled();
  });

  it('findOne → findOne(id)', async () => {
    await controller.findOne(2);
    expect(mockSvc.findOne).toHaveBeenCalledWith(2);
  });

  it('usersInRole → getUsersWithRole(id)', async () => {
    await controller.usersInRole(3);
    expect(mockSvc.getUsersWithRole).toHaveBeenCalledWith(3);
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

  it('clone → cloneRole(id, newName)', async () => {
    await controller.clone(1, { newName: 'RH-Clone' });
    expect(mockSvc.cloneRole).toHaveBeenCalledWith(1, 'RH-Clone');
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });

  it('assign → assignToUser(userId, roleId)', async () => {
    await controller.assign(2, 5);
    expect(mockSvc.assignToUser).toHaveBeenCalledWith(5, 2);
  });

  it('bulkAssign → bulkAssignRole(dto)', async () => {
    const dto = {} as any;
    await controller.bulkAssign(dto);
    expect(mockSvc.bulkAssignRole).toHaveBeenCalledWith(dto);
  });

  it('addPermissions → addPermissionsToRole(roleId, permissionIds)', async () => {
    await controller.addPermissions(2, { permissionIds: [1, 2] });
    expect(mockSvc.addPermissionsToRole).toHaveBeenCalledWith(2, [1, 2]);
  });

  it('removePermissions → removePermissionsFromRole(roleId, permissionIds)', async () => {
    await controller.removePermissions(2, { permissionIds: [1] });
    expect(mockSvc.removePermissionsFromRole).toHaveBeenCalledWith(2, [1]);
  });

  it('setPermissions → setRolePermissions(roleId, permissionIds)', async () => {
    await controller.setPermissions(3, { permissionIds: [1, 2, 3] });
    expect(mockSvc.setRolePermissions).toHaveBeenCalledWith(3, [1, 2, 3]);
  });

  it('compare → compareRoles(a, b)', async () => {
    await controller.compare(1, 2);
    expect(mockSvc.compareRoles).toHaveBeenCalledWith(1, 2);
  });

  it('simulate → simulatePermission(dto)', async () => {
    const dto = {} as any;
    await controller.simulate(dto);
    expect(mockSvc.simulatePermission).toHaveBeenCalledWith(dto);
  });

  it('getTemplates → getPositionTemplates', async () => {
    await controller.getTemplates();
    expect(mockSvc.getPositionTemplates).toHaveBeenCalled();
  });

  it('createTemplate → createPositionTemplate(dto)', async () => {
    const dto = {} as any;
    await controller.createTemplate(dto);
    expect(mockSvc.createPositionTemplate).toHaveBeenCalledWith(dto);
  });

  it('applyTemplate → applyPositionTemplate(positionId)', async () => {
    await controller.applyTemplate(3);
    expect(mockSvc.applyPositionTemplate).toHaveBeenCalledWith(3);
  });
});
