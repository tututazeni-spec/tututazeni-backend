import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AclController } from './acl.controller';
import { RolesPermissionsService } from '../roles-permissions/roles-permissions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockRP = {
  getUserPermissions: jest.fn().mockResolvedValue({ permissions: [] }),
  getAllPermissions: jest.fn().mockResolvedValue([]),
  createPermission: jest.fn().mockResolvedValue({ id: 1 }),
  findAll: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({}),
  cloneRole: jest.fn().mockResolvedValue({ id: 3 }),
  addPermissionsToRole: jest.fn().mockResolvedValue({}),
  removePermissionsFromRole: jest.fn().mockResolvedValue({}),
  assignRoleToUser: jest.fn().mockResolvedValue({}),
  getPermissionMatrix: jest.fn().mockResolvedValue({}),
  getAuditLog: jest.fn().mockResolvedValue({ data: [] }),
  getDeniedLog: jest.fn().mockResolvedValue({ data: [] }),
  getStats: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('AclController', () => {
  let controller: AclController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AclController],
      providers: [{ provide: RolesPermissionsService, useValue: mockRP }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<AclController>(AclController);
  });

  it('myPermissions → getUserPermissions(userId)', async () => {
    await controller.myPermissions(mockUser as never);
    expect(mockRP.getUserPermissions).toHaveBeenCalledWith(1);
  });

  it('allPermissions → getAllPermissions', async () => {
    await controller.allPermissions();
    expect(mockRP.getAllPermissions).toHaveBeenCalled();
  });

  it('createPermission → createPermission(dto)', async () => {
    const dto = {} as never;
    await controller.createPermission(dto);
    expect(mockRP.createPermission).toHaveBeenCalledWith(dto);
  });

  it('getRoles → findAll', async () => {
    await controller.getRoles();
    expect(mockRP.findAll).toHaveBeenCalled();
  });

  it('getRole → findOne(id)', async () => {
    await controller.getRole(2);
    expect(mockRP.findOne).toHaveBeenCalledWith(2);
  });

  it('getRole inexistente → devolve null (adaptador preserva contrato histórico)', async () => {
    mockRP.findOne.mockRejectedValueOnce(new NotFoundException());
    expect(await controller.getRole(999)).toBeNull();
  });

  it('getRole propaga erros que não sejam NotFound', async () => {
    mockRP.findOne.mockRejectedValueOnce(new Error('boom'));
    await expect(controller.getRole(1)).rejects.toThrow('boom');
  });

  it('createRole → create(dto)', async () => {
    const dto = {} as never;
    await controller.createRole(dto);
    expect(mockRP.create).toHaveBeenCalledWith(dto);
  });

  it('updateRole → update(id, dto)', async () => {
    const dto = {} as never;
    await controller.updateRole(1, dto);
    expect(mockRP.update).toHaveBeenCalledWith(1, dto);
  });

  it('cloneRole → cloneRole(id, dto.newName)', async () => {
    await controller.cloneRole(1, { newName: 'Novo' } as never);
    expect(mockRP.cloneRole).toHaveBeenCalledWith(1, 'Novo');
  });

  it('rolePermissions → findOne(id)', async () => {
    await controller.rolePermissions(3);
    expect(mockRP.findOne).toHaveBeenCalledWith(3);
  });

  it('rolePermissions inexistente → devolve null', async () => {
    mockRP.findOne.mockRejectedValueOnce(new NotFoundException());
    expect(await controller.rolePermissions(999)).toBeNull();
  });

  it('assign → addPermissionsToRole(rId, [pId])', async () => {
    await controller.assign(2, 5);
    expect(mockRP.addPermissionsToRole).toHaveBeenCalledWith(2, [5]);
  });

  it('revoke → removePermissionsFromRole(rId, [pId])', async () => {
    await controller.revoke(2, 5);
    expect(mockRP.removePermissionsFromRole).toHaveBeenCalledWith(2, [5]);
  });

  it('bulkAssign → addPermissionsToRole(roleId, permissionIds)', async () => {
    await controller.bulkAssign({ roleId: 4, permissionIds: [1, 2] } as never);
    expect(mockRP.addPermissionsToRole).toHaveBeenCalledWith(4, [1, 2]);
  });

  it('assignRole → assignRoleToUser(dto)', async () => {
    const dto = {} as never;
    await controller.assignRole(dto);
    expect(mockRP.assignRoleToUser).toHaveBeenCalledWith(dto);
  });

  it('matrix → getPermissionMatrix', async () => {
    await controller.matrix();
    expect(mockRP.getPermissionMatrix).toHaveBeenCalled();
  });

  it('auditLog → getAuditLog(filters)', async () => {
    const filters = {} as never;
    await controller.auditLog(filters);
    expect(mockRP.getAuditLog).toHaveBeenCalledWith(filters);
  });

  it('deniedLog → getDeniedLog(filters)', async () => {
    const filters = {} as never;
    await controller.deniedLog(filters);
    expect(mockRP.getDeniedLog).toHaveBeenCalledWith(filters);
  });

  it('stats → getStats', async () => {
    await controller.stats();
    expect(mockRP.getStats).toHaveBeenCalled();
  });

  it('não expõe handlers ABAC removidos (policies / check)', () => {
    expect((controller as unknown as Record<string, unknown>).check).toBeUndefined();
    expect((controller as unknown as Record<string, unknown>).getPolicies).toBeUndefined();
    expect((controller as unknown as Record<string, unknown>).createPolicy).toBeUndefined();
  });
});
