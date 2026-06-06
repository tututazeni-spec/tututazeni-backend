import { Test, TestingModule } from '@nestjs/testing';
import { AclController } from './acl.controller';
import { AclService } from './acl.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getUserPermissions: jest.fn().mockResolvedValue([]),
  getAllPermissions: jest.fn().mockResolvedValue([]),
  createPermission: jest.fn().mockResolvedValue({ id: 1 }),
  getRoles: jest.fn().mockResolvedValue([]),
  getRole: jest.fn().mockResolvedValue({ id: 1 }),
  createRole: jest.fn().mockResolvedValue({ id: 2 }),
  updateRole: jest.fn().mockResolvedValue({}),
  cloneRole: jest.fn().mockResolvedValue({ id: 3 }),
  getRolePermissions: jest.fn().mockResolvedValue([]),
  assignPermissionToRole: jest.fn().mockResolvedValue({}),
  revokePermissionFromRole: jest.fn().mockResolvedValue({}),
  bulkAssignPermissions: jest.fn().mockResolvedValue({}),
  assignRoleToUser: jest.fn().mockResolvedValue({}),
  checkPermission: jest.fn().mockResolvedValue({ allowed: true }),
  getPermissionMatrix: jest.fn().mockResolvedValue([]),
  getPolicies: jest.fn().mockResolvedValue([]),
  createPolicy: jest.fn().mockResolvedValue({ id: 1 }),
  getAuditLog: jest.fn().mockResolvedValue([]),
  getDeniedLog: jest.fn().mockResolvedValue([]),
  getStats: jest.fn().mockResolvedValue({}),
  seedBuiltinPermissions: jest.fn().mockResolvedValue({ seeded: 35 }),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('AclController', () => {
  let controller: AclController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AclController],
      providers: [{ provide: AclService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AclController>(AclController);
  });

  it('myPermissions → getUserPermissions(userId)', async () => {
    await controller.myPermissions(mockUser as any);
    expect(mockSvc.getUserPermissions).toHaveBeenCalledWith(1);
  });

  it('allPermissions → getAllPermissions', async () => {
    await controller.allPermissions();
    expect(mockSvc.getAllPermissions).toHaveBeenCalled();
  });

  it('createPermission → createPermission(dto)', async () => {
    const dto = {} as any;
    await controller.createPermission(dto);
    expect(mockSvc.createPermission).toHaveBeenCalledWith(dto);
  });

  it('getRoles → getRoles', async () => {
    await controller.getRoles();
    expect(mockSvc.getRoles).toHaveBeenCalled();
  });

  it('getRole → getRole(id)', async () => {
    await controller.getRole(2);
    expect(mockSvc.getRole).toHaveBeenCalledWith(2);
  });

  it('createRole → createRole(dto)', async () => {
    const dto = {} as any;
    await controller.createRole(dto);
    expect(mockSvc.createRole).toHaveBeenCalledWith(dto);
  });

  it('updateRole → updateRole(id, dto)', async () => {
    const dto = {} as any;
    await controller.updateRole(1, dto);
    expect(mockSvc.updateRole).toHaveBeenCalledWith(1, dto);
  });

  it('cloneRole → cloneRole(id, dto)', async () => {
    const dto = {} as any;
    await controller.cloneRole(1, dto);
    expect(mockSvc.cloneRole).toHaveBeenCalledWith(1, dto);
  });

  it('rolePermissions → getRolePermissions(id)', async () => {
    await controller.rolePermissions(3);
    expect(mockSvc.getRolePermissions).toHaveBeenCalledWith(3);
  });

  it('assign → assignPermissionToRole(rId, pId)', async () => {
    await controller.assign(2, 5);
    expect(mockSvc.assignPermissionToRole).toHaveBeenCalledWith(2, 5);
  });

  it('revoke → revokePermissionFromRole(rId, pId)', async () => {
    await controller.revoke(2, 5);
    expect(mockSvc.revokePermissionFromRole).toHaveBeenCalledWith(2, 5);
  });

  it('bulkAssign → bulkAssignPermissions(dto)', async () => {
    const dto = {} as any;
    await controller.bulkAssign(dto);
    expect(mockSvc.bulkAssignPermissions).toHaveBeenCalledWith(dto);
  });

  it('assignRole → assignRoleToUser(dto)', async () => {
    const dto = {} as any;
    await controller.assignRole(dto);
    expect(mockSvc.assignRoleToUser).toHaveBeenCalledWith(dto);
  });

  it('check → checkPermission(dto)', async () => {
    const dto = {} as any;
    await controller.check(dto);
    expect(mockSvc.checkPermission).toHaveBeenCalledWith(dto);
  });

  it('matrix → getPermissionMatrix', async () => {
    await controller.matrix();
    expect(mockSvc.getPermissionMatrix).toHaveBeenCalled();
  });

  it('getPolicies → getPolicies', async () => {
    await controller.getPolicies();
    expect(mockSvc.getPolicies).toHaveBeenCalled();
  });

  it('createPolicy → createPolicy(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createPolicy(dto, mockUser as any);
    expect(mockSvc.createPolicy).toHaveBeenCalledWith(dto, 1);
  });

  it('auditLog → getAuditLog(filters)', async () => {
    const filters = {} as any;
    await controller.auditLog(filters);
    expect(mockSvc.getAuditLog).toHaveBeenCalledWith(filters);
  });

  it('deniedLog → getDeniedLog(filters)', async () => {
    const filters = {} as any;
    await controller.deniedLog(filters);
    expect(mockSvc.getDeniedLog).toHaveBeenCalledWith(filters);
  });

  it('stats → getStats', async () => {
    await controller.stats();
    expect(mockSvc.getStats).toHaveBeenCalled();
  });

  it('seedPermissions → seedBuiltinPermissions', async () => {
    await controller.seedPermissions();
    expect(mockSvc.seedBuiltinPermissions).toHaveBeenCalled();
  });
});
