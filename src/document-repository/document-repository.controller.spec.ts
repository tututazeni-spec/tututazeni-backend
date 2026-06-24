import { Test, TestingModule } from '@nestjs/testing';
import { DocumentRepositoryController } from './document-repository.controller';
import { DocumentRepositoryService } from './document-repository.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  getDashboard: jest.fn().mockResolvedValue({}),
  getStats: jest.fn().mockResolvedValue({}),
  getAllTags: jest.fn().mockResolvedValue([]),
  getExpiringSoon: jest.fn().mockResolvedValue([]),
  getCategories: jest.fn().mockResolvedValue([]),
  createCategory: jest.fn().mockResolvedValue({ id: 1 }),
  resolveShareLink: jest.fn().mockResolvedValue({}),
  findAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  findOne: jest.fn().mockResolvedValue({ id: 1 }),
  download: jest.fn().mockResolvedValue({}),
  getAuditLog: jest.fn().mockResolvedValue([]),
  getAccessLog: jest.fn().mockResolvedValue([]),
  create: jest.fn().mockResolvedValue({ id: 2 }),
  update: jest.fn().mockResolvedValue({ id: 1 }),
  newVersion: jest.fn().mockResolvedValue({ id: 1 }),
  restoreVersion: jest.fn().mockResolvedValue({}),
  archive: jest.fn().mockResolvedValue({}),
  renewDocument: jest.fn().mockResolvedValue({}),
  softDelete: jest.fn().mockResolvedValue({}),
  grantPermission: jest.fn().mockResolvedValue({}),
  revokePermission: jest.fn().mockResolvedValue({}),
  createShareLink: jest.fn().mockResolvedValue({ token: 'abc' }),
  processExpiredDocuments: jest.fn().mockResolvedValue({ processed: 0 }),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('DocumentRepositoryController', () => {
  let controller: DocumentRepositoryController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DocumentRepositoryController],
      providers: [{ provide: DocumentRepositoryService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<DocumentRepositoryController>(DocumentRepositoryController);
  });

  it('getDashboard → getDashboard', async () => {
    await controller.getDashboard();
    expect(mockSvc.getDashboard).toHaveBeenCalled();
  });

  it('getStats → getStats(department)', async () => {
    await controller.getStats('IT');
    expect(mockSvc.getStats).toHaveBeenCalledWith('IT');
  });

  it('getTags → getAllTags', async () => {
    await controller.getTags();
    expect(mockSvc.getAllTags).toHaveBeenCalled();
  });

  it('getExpiringSoon sem days → getExpiringSoon(30)', async () => {
    await controller.getExpiringSoon();
    expect(mockSvc.getExpiringSoon).toHaveBeenCalledWith(30);
  });

  it('getCategories → getCategories', async () => {
    await controller.getCategories();
    expect(mockSvc.getCategories).toHaveBeenCalled();
  });

  it('createCategory → createCategory(dto)', async () => {
    const dto = {} as any;
    await controller.createCategory(dto);
    expect(mockSvc.createCategory).toHaveBeenCalledWith(dto);
  });

  it('resolveShare → resolveShareLink(token)', async () => {
    await controller.resolveShare('token-abc');
    expect(mockSvc.resolveShareLink).toHaveBeenCalledWith('token-abc', undefined);
  });

  it('findAll → findAll(filters, userId, ...)', async () => {
    const filters = {} as any;
    await controller.findAll(filters, mockUser as any);
    expect(mockSvc.findAll).toHaveBeenCalledWith(filters, 1, undefined, 'ADMIN');
  });

  it('findOne → findOne(id, userId)', async () => {
    await controller.findOne(3, mockUser as any);
    expect(mockSvc.findOne).toHaveBeenCalledWith(3, 1);
  });

  it('download → download(id, userId)', async () => {
    await controller.download(2, mockUser as any);
    expect(mockSvc.download).toHaveBeenCalledWith(2, 1);
  });

  it('getAuditLog → getAuditLog(id)', async () => {
    await controller.getAuditLog(4);
    expect(mockSvc.getAuditLog).toHaveBeenCalledWith(4);
  });

  it('getAccessLog → getAccessLog(id)', async () => {
    await controller.getAccessLog(5);
    expect(mockSvc.getAccessLog).toHaveBeenCalledWith(5);
  });

  it('create → create(userId, dto)', async () => {
    const dto = {} as any;
    await controller.create(mockUser as any, dto);
    expect(mockSvc.create).toHaveBeenCalledWith(1, dto);
  });

  it('update → update(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.update(1, dto, mockUser as any);
    expect(mockSvc.update).toHaveBeenCalledWith(1, dto, 1);
  });

  it('newVersion → newVersion(id, dto, userId)', async () => {
    const dto = {} as any;
    await controller.newVersion(2, dto, mockUser as any);
    expect(mockSvc.newVersion).toHaveBeenCalledWith(2, dto, 1);
  });

  it('restoreVersion → restoreVersion(id, versionId, userId)', async () => {
    await controller.restoreVersion(3, 2, mockUser as any);
    expect(mockSvc.restoreVersion).toHaveBeenCalledWith(3, 2, 1);
  });

  it('archive → archive(id, userId, reason)', async () => {
    await controller.archive(4, { reason: 'old' }, mockUser as any);
    expect(mockSvc.archive).toHaveBeenCalledWith(4, 1, 'old');
  });

  it('renew → renewDocument(id, newExpiresAt, userId)', async () => {
    await controller.renew(5, { newExpiresAt: '2025-12-31' }, mockUser as any);
    expect(mockSvc.renewDocument).toHaveBeenCalledWith(5, '2025-12-31', 1);
  });

  it('remove → softDelete(id, userId, reason)', async () => {
    await controller.remove(6, { reason: 'cleanup' }, mockUser as any);
    expect(mockSvc.softDelete).toHaveBeenCalledWith(6, 1, 'cleanup');
  });

  it('grantPermission → grantPermission(dto, userId)', async () => {
    const dto = {} as any;
    await controller.grantPermission(dto, mockUser as any);
    expect(mockSvc.grantPermission).toHaveBeenCalledWith(dto, 1);
  });

  it('revokePermission → revokePermission(id, userId)', async () => {
    await controller.revokePermission(3, mockUser as any);
    expect(mockSvc.revokePermission).toHaveBeenCalledWith(3, 1);
  });

  it('createShareLink → createShareLink(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createShareLink(dto, mockUser as any);
    expect(mockSvc.createShareLink).toHaveBeenCalledWith(dto, 1);
  });

  it('processExpired → processExpiredDocuments', async () => {
    await controller.processExpired();
    expect(mockSvc.processExpiredDocuments).toHaveBeenCalled();
  });
});
