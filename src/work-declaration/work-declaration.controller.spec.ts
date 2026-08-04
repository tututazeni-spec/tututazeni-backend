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

// tenantId nunca existe em CurrentUserData/User (ver comentário em
// WorkDeclarationController#create) — o controller passa sempre `undefined`
// ao serviço, que o auto-resolve para o tenant "DEFAULT". mockUser reflecte
// o shape real de CurrentUserData, não o antigo IAuthUser fictício.
const mockUser = {
  id: 1,
  email: 'test@innova.com',
  active: true,
  roleId: 1,
  role: { id: 1, name: 'ADMIN' },
};
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
    expect(mockSvc.createDeclaration).toHaveBeenCalledWith(undefined, 1, dto);
  });

  it('findAll → listDeclarations(tenantId, user, filters)', async () => {
    const filters = {} as any;
    await controller.findAll(filters, mockUser as any);
    expect(mockSvc.listDeclarations).toHaveBeenCalledWith(undefined, mockUser, filters);
  });

  it('getDashboardStats → getStats(tenantId)', async () => {
    await controller.getDashboardStats();
    expect(mockSvc.getStats).toHaveBeenCalledWith(undefined);
  });

  it('findOne → getDeclaration(tenantId, user, id)', async () => {
    await controller.findOne('uuid-1', mockUser as any);
    expect(mockSvc.getDeclaration).toHaveBeenCalledWith(undefined, mockUser, 'uuid-1');
  });

  it('update → updateDeclaration(tenantId, userId, id, dto)', async () => {
    const dto = {} as any;
    await controller.update('uuid-1', dto, mockUser as any);
    expect(mockSvc.updateDeclaration).toHaveBeenCalledWith(undefined, 1, 'uuid-1', dto);
  });

  it('remove → changeStatus (REVOKED)', async () => {
    await controller.remove('uuid-1', mockUser as any);
    expect(mockSvc.changeStatus).toHaveBeenCalledWith(
      undefined,
      1,
      'uuid-1',
      expect.objectContaining({ status: 'REVOKED' }),
    );
  });

  it('requestDeclaration → requestDeclaration(tenantId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.requestDeclaration(dto, mockUser as any);
    expect(mockSvc.requestDeclaration).toHaveBeenCalledWith(undefined, 1, dto);
  });

  it('getMyDeclarations → listDeclarations(tenantId, user, query)', async () => {
    await controller.getMyDeclarations(mockUser as any);
    expect(mockSvc.listDeclarations).toHaveBeenCalledWith(undefined, mockUser, expect.anything());
  });

  it('issueDeclaration → changeStatus(ISSUED)', async () => {
    await controller.issueDeclaration('uuid-1', mockUser as any);
    expect(mockSvc.changeStatus).toHaveBeenCalledWith(
      undefined,
      1,
      'uuid-1',
      expect.objectContaining({ status: 'ISSUED' }),
    );
  });

  it('verifyDeclaration → verifyDeclaration(code)', async () => {
    await controller.verifyDeclaration('code-123');
    expect(mockSvc.verifyDeclaration).toHaveBeenCalledWith({ code: 'code-123' });
  });

  it('getTemplates → listTemplates(tenantId)', async () => {
    await controller.getTemplates('TYPE', 'pt', undefined as any, undefined as any);
    expect(mockSvc.listTemplates).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it('getTemplate → getTemplate(tenantId, id)', async () => {
    await controller.getTemplate(1);
    expect(mockSvc.getTemplate).toHaveBeenCalledWith(undefined, 1);
  });

  it('createTemplate → createTemplate(tenantId, userId, dto)', async () => {
    const dto = {} as any;
    await controller.createTemplate(dto, mockUser as any);
    expect(mockSvc.createTemplate).toHaveBeenCalledWith(undefined, 1, dto);
  });

  it('updateTemplate → updateTemplate(tenantId, userId, id, dto)', async () => {
    const dto = {} as any;
    await controller.updateTemplate(1, dto, mockUser as any);
    expect(mockSvc.updateTemplate).toHaveBeenCalledWith(undefined, 1, 1, dto);
  });

  it('deleteTemplate → deleteTemplate(tenantId, id)', async () => {
    await controller.deleteTemplate(1);
    expect(mockSvc.deleteTemplate).toHaveBeenCalledWith(undefined, 1);
  });

  it('getAuditLog → getAuditLogs(tenantId, id)', async () => {
    await controller.getAuditLog('uuid-1');
    expect(mockSvc.getAuditLogs).toHaveBeenCalledWith(undefined, 'uuid-1');
  });

  it('getBrandingSettings → getTenantConfig(tenantId)', async () => {
    await controller.getBrandingSettings();
    expect(mockSvc.getTenantConfig).toHaveBeenCalledWith(undefined);
  });

  it('updateBrandingSettings → upsertTenantConfig(tenantId, settings)', async () => {
    const settings = { companyName: 'Test' } as any;
    await controller.updateBrandingSettings(settings);
    expect(mockSvc.upsertTenantConfig).toHaveBeenCalledWith(undefined, settings);
  });

  it('uploadLogo → upsertTenantConfig(tenantId, { logoUrl: dto.fileUrl })', async () => {
    const dto = { fileUrl: 'https://storage.innova.ao/logo.png' };
    await controller.uploadLogo(dto as any);
    expect(mockSvc.upsertTenantConfig).toHaveBeenCalledWith(undefined, {
      logoUrl: 'https://storage.innova.ao/logo.png',
    });
  });

  it('signDeclaration → signDeclaration(tenantId, userId, id, dto) sem signatureFile', async () => {
    const dto = { type: 'DIGITAL', signatureUrl: undefined } as any;
    await controller.signDeclaration('uuid-1', dto, mockUser as any);
    expect(mockSvc.signDeclaration).toHaveBeenCalledWith(undefined, 1, 'uuid-1', dto);
  });

  it('exportPdf → exportDeclaration(tenantId, userId, id, { format: PDF })', async () => {
    const dto = { includeWatermark: true } as any;
    await controller.exportPdf('uuid-1', dto, mockUser as any, mockRes);
    expect(mockSvc.exportDeclaration).toHaveBeenCalledWith(undefined, 1, 'uuid-1', {
      format: 'PDF',
      includeWatermark: true,
    });
  });

  it('exportDocx → exportDeclaration(tenantId, userId, id, { format: DOCX })', async () => {
    await controller.exportDocx('uuid-1', mockUser as any, mockRes);
    expect(mockSvc.exportDeclaration).toHaveBeenCalledWith(undefined, 1, 'uuid-1', {
      format: 'DOCX',
    });
  });
});
