import { Test, TestingModule } from '@nestjs/testing';
import { CertificationController } from './certification.controller';
import { CertificationService } from './certification.service';

const mockSvc = {
  verify: jest.fn().mockResolvedValue({ valid: true }),
  createTemplate: jest.fn().mockResolvedValue({ id: 1 }),
  findAllTemplates: jest.fn().mockResolvedValue([]),
  getDashboard: jest.fn().mockResolvedValue({}),
  issueCertificate: jest.fn().mockResolvedValue({ id: 1 }),
  findAllCertificates: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  getMyCertificates: jest.fn().mockResolvedValue({ data: [], total: 0 }),
  findCertificateById: jest.fn().mockResolvedValue({ id: 1 }),
  downloadCertificate: jest.fn().mockResolvedValue({ url: 'x' }),
  revokeCertificate: jest.fn().mockResolvedValue({ id: 1 }),
  createBadge: jest.fn().mockResolvedValue({ id: 1 }),
  findAllBadges: jest.fn().mockResolvedValue([]),
  issueBadge: jest.fn().mockResolvedValue({ id: 1 }),
  getMyBadges: jest.fn().mockResolvedValue([]),
};

const mockUser = { id: 1, email: 'test@innova.com', role: { name: 'ADMIN' } };

describe('CertificationController', () => {
  let controller: CertificationController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CertificationController],
      providers: [{ provide: CertificationService, useValue: mockSvc }],
    }).compile();
    controller = module.get<CertificationController>(CertificationController);
  });

  it('verify → verify(code) — rota pública', async () => {
    await controller.verify('CODE-1');
    expect(mockSvc.verify).toHaveBeenCalledWith('CODE-1');
  });

  it('createTemplate → createTemplate(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createTemplate(dto, mockUser as any);
    expect(mockSvc.createTemplate).toHaveBeenCalledWith(dto, 1);
  });

  it('findAllTemplates → findAllTemplates()', async () => {
    await controller.findAllTemplates();
    expect(mockSvc.findAllTemplates).toHaveBeenCalled();
  });

  it('getDashboard → getDashboard()', async () => {
    await controller.getDashboard();
    expect(mockSvc.getDashboard).toHaveBeenCalled();
  });

  it('issueCertificate → issueCertificate(dto, userId)', async () => {
    const dto = {} as any;
    await controller.issueCertificate(dto, mockUser as any);
    expect(mockSvc.issueCertificate).toHaveBeenCalledWith(dto, 1);
  });

  it('findAllCertificates → findAllCertificates(filters)', async () => {
    const filters = {} as any;
    await controller.findAllCertificates(filters);
    expect(mockSvc.findAllCertificates).toHaveBeenCalledWith(filters);
  });

  it('getMyCertificates → getMyCertificates(userId, filters)', async () => {
    await controller.getMyCertificates(mockUser as any, { page: 1, limit: 20 } as any);
    expect(mockSvc.getMyCertificates).toHaveBeenCalledWith(1, { page: 1, limit: 20 });
  });

  it('findCertificateById → findCertificateById(id, user)', async () => {
    await controller.findCertificateById('c1', mockUser as any);
    expect(mockSvc.findCertificateById).toHaveBeenCalledWith('c1', mockUser);
  });

  it('download → downloadCertificate(id, user)', async () => {
    await controller.download('c1', mockUser as any);
    expect(mockSvc.downloadCertificate).toHaveBeenCalledWith('c1', mockUser);
  });

  it('revoke → revokeCertificate(id, dto, user)', async () => {
    const dto = {} as any;
    await controller.revoke('c1', dto, mockUser as any);
    expect(mockSvc.revokeCertificate).toHaveBeenCalledWith('c1', dto, mockUser);
  });

  it('createBadge → createBadge(dto, userId)', async () => {
    const dto = {} as any;
    await controller.createBadge(dto, mockUser as any);
    expect(mockSvc.createBadge).toHaveBeenCalledWith(dto, 1);
  });

  it('findAllBadges → findAllBadges()', async () => {
    await controller.findAllBadges();
    expect(mockSvc.findAllBadges).toHaveBeenCalled();
  });

  it('issueBadge → issueBadge(dto, userId)', async () => {
    const dto = {} as any;
    await controller.issueBadge(dto, mockUser as any);
    expect(mockSvc.issueBadge).toHaveBeenCalledWith(dto, 1);
  });

  it('getMyBadges → getMyBadges(userId)', async () => {
    await controller.getMyBadges(mockUser as any);
    expect(mockSvc.getMyBadges).toHaveBeenCalledWith(1);
  });
});
