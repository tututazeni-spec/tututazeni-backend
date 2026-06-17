import { Test, TestingModule } from '@nestjs/testing';
import { CertificationService } from './certification.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

const mockUser = { fullName: 'João Teste', email: 'joao@teste.com' };
const mockCert = {
  id: 'cert-1',
  code: 'CERT-00001',
  verificationCode: 'INNOVA-123-ABCD',
  hashCode: 'hash123',
  userId: 1,
  title: 'Curso Teste',
  recipientName: 'João Teste',
  type: 'COURSE',
  isRevoked: false,
  deletedAt: null,
  expiresAt: null,
  verifyCount: 0,
  user: mockUser,
  issuedBy: { fullName: 'Admin' },
  template: null,
};

const mockPrisma = {
  user: { findUnique: jest.fn() },
  certificateTemplate: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  issuedCertificate: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
  digitalBadge: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  badgeIssuance: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  notificationLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('CertificationService', () => {
  let service: CertificationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CertificationService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<CertificationService>(CertificationService);
    jest.clearAllMocks();
  });

  describe('issueCertificate', () => {
    it('deve emitir certificado com código e verificação', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.issuedCertificate.findFirst.mockResolvedValue(null);
      mockPrisma.issuedCertificate.create.mockResolvedValue(mockCert);
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.issueCertificate({ userId: 1, title: 'Curso Teste' }, 1);
      expect(result.code).toBe('CERT-00001');
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'CERTIFICATE_ISSUED' }),
        }),
      );
    });

    it('deve lançar NotFoundException se utilizador não existir', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.issueCertificate({ userId: 999, title: 'X' }, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('verify', () => {
    it('deve retornar valid:true para certificado válido', async () => {
      mockPrisma.issuedCertificate.findUnique.mockResolvedValue(mockCert);
      mockPrisma.issuedCertificate.update.mockResolvedValue({});

      const result = await service.verify('INNOVA-123-ABCD');
      expect(result.valid).toBe(true);
      expect(result.certificate?.holder).toBe('João Teste');
    });

    it('deve retornar valid:false para código inválido', async () => {
      mockPrisma.issuedCertificate.findUnique.mockResolvedValue(null);
      const result = await service.verify('CODIGO-INVALIDO');
      expect(result.valid).toBe(false);
    });

    it('deve retornar valid:false para certificado revogado', async () => {
      mockPrisma.issuedCertificate.findUnique.mockResolvedValue({
        ...mockCert,
        isRevoked: true,
        revokedAt: new Date(),
      });
      const result = await service.verify('INNOVA-123-ABCD');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('revogado');
    });

    it('deve retornar valid:false para certificado expirado', async () => {
      mockPrisma.issuedCertificate.findUnique.mockResolvedValue({
        ...mockCert,
        expiresAt: new Date('2020-01-01'),
      });
      const result = await service.verify('INNOVA-123-ABCD');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expirado');
    });
  });

  describe('revokeCertificate', () => {
    it('deve revogar e notificar o utilizador', async () => {
      mockPrisma.issuedCertificate.findUnique.mockResolvedValue(mockCert);
      mockPrisma.issuedCertificate.update.mockResolvedValue({
        ...mockCert,
        isRevoked: true,
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.revokeCertificate('cert-1', { reason: 'Erro de emissão' }, 1);
      expect(result.isRevoked).toBe(true);
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'CERTIFICATE_REVOKED' }),
        }),
      );
    });

    it('deve lançar ConflictException se já revogado', async () => {
      mockPrisma.issuedCertificate.findUnique.mockResolvedValue({
        ...mockCert,
        isRevoked: true,
      });
      await expect(service.revokeCertificate('cert-1', { reason: 'XXXXX' }, 1)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('downloadCertificate', () => {
    it('deve incrementar downloadCount e auditar', async () => {
      mockPrisma.issuedCertificate.findUnique.mockResolvedValue(mockCert);
      mockPrisma.issuedCertificate.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.downloadCertificate('cert-1', 1);
      expect(result.title).toBe('Curso Teste');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('createTemplate', () => {
    it('deve criar template e desactivar default anterior se isDefault', async () => {
      mockPrisma.certificateTemplate.updateMany.mockResolvedValue({});
      mockPrisma.certificateTemplate.create.mockResolvedValue({
        id: 'tpl-1',
        name: 'T1',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createTemplate(
        { name: 'T1', html: '<div></div>', isDefault: true } as any,
        1,
      );
      expect(result.id).toBe('tpl-1');
      expect(mockPrisma.certificateTemplate.updateMany).toHaveBeenCalled();
    });
  });

  describe('createBadge', () => {
    it('deve criar badge com código BDG-', async () => {
      mockPrisma.digitalBadge.findFirst.mockResolvedValue(null);
      mockPrisma.digitalBadge.create.mockResolvedValue({
        id: 'bdg-1',
        code: 'BDG-00001',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createBadge(
        {
          name: 'Líder',
          description: 'x',
          imageUrl: 'http://i',
          criteria: 'y',
        },
        1,
      );
      expect(result.code).toBe('BDG-00001');
    });
  });

  describe('issueBadge', () => {
    it('deve emitir badge e notificar', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        { id: 'badge-1', name: 'Badge Teste' },
        { fullName: 'João Teste' },
      ]);
      mockPrisma.badgeIssuance.findUnique.mockResolvedValue(null);
      mockPrisma.badgeIssuance.create.mockResolvedValue({ id: 'iss-1' });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.issueBadge({ badgeId: 'badge-1', userId: 1 }, 1);
      expect(result.id).toBe('iss-1');
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'BADGE_EARNED' }),
        }),
      );
    });

    it('deve lançar ConflictException se já possui o badge', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        { id: 'badge-1', name: 'Badge Teste' },
        { fullName: 'João Teste' },
      ]);
      mockPrisma.badgeIssuance.findUnique.mockResolvedValue({
        id: 'iss-1',
        deletedAt: null,
      });
      await expect(service.issueBadge({ badgeId: 'badge-1', userId: 1 }, 1)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deve lançar NotFoundException se badge não existir', async () => {
      mockPrisma.$transaction.mockResolvedValue([null, { fullName: 'João' }]);
      await expect(service.issueBadge({ badgeId: 'nao-existe', userId: 1 }, 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMyCertificates', () => {
    it('deve retornar certificados paginados do utilizador', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockCert], 1]);
      const result = await service.getMyCertificates(1, 1, 20);
      expect(result.total).toBe(1);
    });
  });

  describe('getDashboard', () => {
    it('deve retornar totais de certificados e badges', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        20,
        5,
        2,
        1,
        [],
        3,
        8,
        4,
        { _sum: { verifyCount: 50 } },
        [],
      ]);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('totals');
      expect(result.totals.valid).toBe(17);
      expect(result.totals.totalVerifications).toBe(50);
    });
  });
});
