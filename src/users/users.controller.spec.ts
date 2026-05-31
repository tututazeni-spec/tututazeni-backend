import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  findOne: jest.fn().mockResolvedValue({ id: 1, fullName: 'Test', email: 'test@innova.com' }),
  getUserStats: jest.fn().mockResolvedValue({}),
  getTeam: jest.fn().mockResolvedValue([]),
  getAuditLogs: jest.fn().mockResolvedValue([]),
  upsertProfile: jest.fn().mockResolvedValue({}),
  changePassword: jest.fn().mockResolvedValue({ message: 'ok' }),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getDirectory: jest.fn().mockResolvedValue([]),
  getAdminDashboard: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  invite: jest.fn().mockResolvedValue({ message: 'ok' }),
  bulkImport: jest.fn().mockResolvedValue({ created: 0, errors: [] }),
  bulkAction: jest.fn().mockResolvedValue({ affected: 0 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  activate: jest.fn().mockResolvedValue({ message: 'ok' }),
  deactivate: jest.fn().mockResolvedValue({ message: 'ok' }),
  suspend: jest.fn().mockResolvedValue({ message: 'ok' }),
  remove: jest.fn().mockResolvedValue({ message: 'ok' }),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<UsersController>(UsersController);
  });

  it('me → findOne(user.id)', async () => {
    await controller.me(mockUser as any);
    expect(mockSvc.findOne).toHaveBeenCalledWith(1);
  });

  it('myStats → getUserStats(user.id)', async () => {
    await controller.myStats(mockUser as any);
    expect(mockSvc.getUserStats).toHaveBeenCalledWith(1);
  });

  it('myTeam → getTeam(user.id)', async () => {
    await controller.myTeam(mockUser as any);
    expect(mockSvc.getTeam).toHaveBeenCalledWith(1);
  });

  it('myAuditLogs → getAuditLogs sem page', async () => {
    await controller.myAuditLogs(mockUser as any);
    expect(mockSvc.getAuditLogs).toHaveBeenCalledWith(1, 1);
  });

  it('myAuditLogs → getAuditLogs com page', async () => {
    await controller.myAuditLogs(mockUser as any, '3');
    expect(mockSvc.getAuditLogs).toHaveBeenCalledWith(1, 3);
  });

  it('updateMyProfile → upsertProfile', async () => {
    const dto = {} as any;
    await controller.updateMyProfile(mockUser as any, dto);
    expect(mockSvc.upsertProfile).toHaveBeenCalledWith(1, dto);
  });

  it('changePassword → changePassword', async () => {
    const dto = {} as any;
    await controller.changePassword(mockUser as any, dto);
    expect(mockSvc.changePassword).toHaveBeenCalledWith(1, dto);
  });

  it('findAll → findAll(filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters);
  });

  it('directory → getDirectory sem params', async () => {
    await controller.directory();
    expect(mockSvc.getDirectory).toHaveBeenCalledWith(undefined, undefined);
  });

  it('directory → getDirectory com search e departmentId', async () => {
    await controller.directory('Ana', '5');
    expect(mockSvc.getDirectory).toHaveBeenCalledWith('Ana', 5);
  });

  it('adminDashboard → getAdminDashboard', async () => {
    await controller.adminDashboard();
    expect(mockSvc.getAdminDashboard).toHaveBeenCalled();
  });

  it('findOne → findOne(id)', async () => {
    const result = await controller.findOne(1);
    expect(mockSvc.findOne).toHaveBeenCalledWith(1);
    expect(result).toHaveProperty('fullName');
  });

  it('stats → getUserStats(id)', async () => {
    await controller.stats(2);
    expect(mockSvc.getUserStats).toHaveBeenCalledWith(2);
  });

  it('team → getTeam(id)', async () => {
    await controller.team(2);
    expect(mockSvc.getTeam).toHaveBeenCalledWith(2);
  });

  it('auditLogs → getAuditLogs sem page', async () => {
    await controller.auditLogs(3);
    expect(mockSvc.getAuditLogs).toHaveBeenCalledWith(3, 1);
  });

  it('auditLogs → getAuditLogs com page', async () => {
    await controller.auditLogs(3, '2');
    expect(mockSvc.getAuditLogs).toHaveBeenCalledWith(3, 2);
  });

  it('create → create(dto)', async () => {
    const dto = {} as any;
    await controller.create(mockUser as any, dto);
    expect(mockSvc.create).toHaveBeenCalledWith(dto);
  });

  it('invite → invite(dto)', async () => {
    const dto = {} as any;
    await controller.invite(dto);
    expect(mockSvc.invite).toHaveBeenCalledWith(dto);
  });

  it('bulkImport → bulkImport', async () => {
    await controller.bulkImport([]);
    expect(mockSvc.bulkImport).toHaveBeenCalledWith([]);
  });

  it('bulkAction → bulkAction', async () => {
    const dto = {} as any;
    await controller.bulkAction(dto);
    expect(mockSvc.bulkAction).toHaveBeenCalledWith(dto);
  });

  it('update → update(id, dto, adminId)', async () => {
    const dto = {} as any;
    await controller.update(1, mockUser as any, dto);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto, 1);
  });

  it('activate → activate(id)', async () => {
    await controller.activate(1);
    expect(mockSvc.activate).toHaveBeenCalledWith(1);
  });

  it('deactivate → deactivate(id)', async () => {
    await controller.deactivate(1);
    expect(mockSvc.deactivate).toHaveBeenCalledWith(1, undefined);
  });

  it('suspend → suspend(id, reason)', async () => {
    await controller.suspend(1, 'motivo');
    expect(mockSvc.suspend).toHaveBeenCalledWith(1, 'motivo');
  });

  it('remove → remove(id)', async () => {
    await controller.remove(1);
    expect(mockSvc.remove).toHaveBeenCalledWith(1);
  });
});
