import { Test, TestingModule } from '@nestjs/testing';
import { WorkDeclarationController } from './work-declaration.controller';
import { WorkDeclarationService } from './work-declaration.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSvc = {
  createDeclaration: jest.fn().mockResolvedValue({ id: 'uuid-1' }),
  listDeclarations: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getStats: jest.fn().mockResolvedValue({}),
  getDeclaration: jest.fn().mockResolvedValue({ id: 'uuid-1' }),
  updateDeclaration: jest.fn().mockResolvedValue({}),
  changeStatus: jest.fn().mockResolvedValue({}),
  requestDeclaration: jest.fn().mockResolvedValue({ id: 'uuid-2' }),
  signDeclaration: jest.fn().mockResolvedValue({}),
  exportDeclaration: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  sendDeclaration: jest.fn().mockResolvedValue({}),
  generateSecureLink: jest.fn().mockReturnValue('https://secure-link'),
  verifyDeclaration: jest.fn().mockResolvedValue({ valid: true }),
  listTemplates: jest.fn().mockResolvedValue([]),
  getTemplate: jest.fn().mockResolvedValue({ id: 'tpl-1' }),
  createTemplate: jest.fn().mockResolvedValue({ id: 'tpl-2' }),
  updateTemplate: jest.fn().mockResolvedValue({}),
  deleteTemplate: jest.fn().mockResolvedValue({}),
  previewTemplate: jest.fn().mockResolvedValue('<html>'),
  getAuditLogs: jest.fn().mockResolvedValue([]),
  upsertTenantConfig: jest.fn().mockResolvedValue({}),
  getTenantConfig: jest.fn().mockResolvedValue({}),
};

const mockUser = { id: 1, tenantId: 'tenant-1', role: 'ADMIN', email: 'test@innova.com' };
const mockRes = { set: jest.fn() } as any;

describe('WorkDeclarationController', () => {
  let controller: WorkDeclarationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkDeclarationController],
      providers: [{ provide: WorkDeclarationService, useValue: mockSvc }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get<WorkDeclarationController>(WorkDeclarationController);
  });

  it('create → createDeclaration(tenantId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.create(dto, mockUser as any);
    expect(mockSvc.createDeclaration).toHaveBeenCalledWith('tenant-1', '1', dto);
  });

  it('findAll → listDeclarations(tenantId, userId, role, filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters, mockUser as any);
    expect(mockSvc.listDeclarations).toHaveBeenCalledWith('tenant-1', '1', 'ADMIN', filters);
  });

  it('getDashboardStats → getStats(tenantId)', async () => {
    await controller.getDashboardStats(mockUser as any);
    expect(mockSvc.getStats).toHaveBeenCalledWith('tenant-1');
  });

  it('findOne → getDeclaration(tenantId, userId, role, id)', async () => {
    await controller.findOne('uuid-1', mockUser as any);
    expect(mockSvc.getDeclaration).toHaveBeenCalledWith('tenant-1', '1', 'ADMIN', 'uuid-1');
  });

  it('update → updateDeclaration(tenantId, userId, id, dto)', async () => {
    const dto = {} as any;
    await controller.update('uuid-1', dto, mockUser as any);
    expect(mockSvc.updateDeclaration).toHaveBeenCalledWith('tenant-1', '1', 'uuid-1', dto);
  });

  it('remove → changeStatus (REVOKED)', async () => {
    await controller.remove('uuid-1', mockUser as any);
    expect(mockSvc.changeStatus).toHaveBeenCalledWith(
      'tenant-1',
      '1',
      'uuid-1',
      expect.objectContaining({ status: 'REVOKED' }),
    );
  });

  it('requestDeclaration → requestDeclaration(tenantId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.requestDeclaration(dto, mockUser as any);
    expect(mockSvc.requestDeclaration).toHaveBeenCalledWith('tenant-1', '1', dto);
  });

  it('getMyDeclarations → listDeclarations(tenantId, userId, EMPLOYEE)', async () => {
    await controller.getMyDeclarations(mockUser as any);
    expect(mockSvc.listDeclarations).toHaveBeenCalledWith(
      'tenant-1',
      '1',
      'EMPLOYEE',
      expect.anything(),
    );
  });

  it('issueDeclaration → changeStatus(ISSUED)', async () => {
    await controller.issueDeclaration('uuid-1', mockUser as any);
    expect(mockSvc.changeStatus).toHaveBeenCalledWith(
      'tenant-1',
      '1',
      'uuid-1',
      expect.objectContaining({ status: 'ISSUED' }),
    );
  });

  it('verifyDeclaration → verifyDeclaration(code)', async () => {
    await controller.verifyDeclaration('code-123');
    expect(mockSvc.verifyDeclaration).toHaveBeenCalledWith({ code: 'code-123' });
  });

  it('getTemplates → listTemplates(tenantId)', async () => {
    await controller.getTemplates('TYPE', 'pt', mockUser as any);
    expect(mockSvc.listTemplates).toHaveBeenCalledWith('tenant-1', expect.anything());
  });

  it('getTemplate → getTemplate(tenantId, id)', async () => {
    await controller.getTemplate('tpl-1', mockUser as any);
    expect(mockSvc.getTemplate).toHaveBeenCalledWith('tenant-1', 'tpl-1');
  });

  it('createTemplate → createTemplate(tenantId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.createTemplate(dto, mockUser as any);
    expect(mockSvc.createTemplate).toHaveBeenCalledWith('tenant-1', '1', dto);
  });

  it('updateTemplate → updateTemplate(tenantId, userId, id, dto)', async () => {
    const dto = {} as any;
    await controller.updateTemplate('tpl-1', dto, mockUser as any);
    expect(mockSvc.updateTemplate).toHaveBeenCalledWith('tenant-1', '1', 'tpl-1', dto);
  });

  it('deleteTemplate → deleteTemplate(tenantId, id)', async () => {
    await controller.deleteTemplate('tpl-1', mockUser as any);
    expect(mockSvc.deleteTemplate).toHaveBeenCalledWith('tenant-1', 'tpl-1');
  });

  it('getAuditLog → getAuditLogs(tenantId, id)', async () => {
    await controller.getAuditLog('uuid-1', mockUser as any);
    expect(mockSvc.getAuditLogs).toHaveBeenCalledWith('tenant-1', 'uuid-1');
  });

  it('getBrandingSettings → getTenantConfig(tenantId)', async () => {
    await controller.getBrandingSettings(mockUser as any);
    expect(mockSvc.getTenantConfig).toHaveBeenCalledWith('tenant-1');
  });

  it('updateBrandingSettings → upsertTenantConfig(tenantId, settings)', async () => {
    const settings = { color: '#fff' };
    await controller.updateBrandingSettings(settings, mockUser as any);
    expect(mockSvc.upsertTenantConfig).toHaveBeenCalledWith('tenant-1', settings);
  });
});
