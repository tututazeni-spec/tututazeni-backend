import { Test, TestingModule } from '@nestjs/testing';
import { CertificationService } from './certification.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { AuditService } from '../common/services/audit.service';

const mockUser = { fullName: 'João Teste', email: 'joao@teste.com' };
// Fase F2: forma de `Certificate` (Int id, validationCode, revoked, legacyType,
// legacyIssuedCertId dá o id string ao contrato).
const mockCert = {
  id: 1,
  code: 'CERT-00001',
  validationCode: 'INNOVA-123-ABCD',
  hashCode: 'hash123',
  userId: 1,
  courseId: null,
  programId: null,
  templateId: null,
  title: 'Curso Teste',
  recipientName: 'João Teste',
  issuerName: 'INNOVA',
  type: 'COURSE',
  legacyType: 'COURSE',
  legacyIssuedCertId: 'cert-1',
  revoked: false,
  revokedAt: null,
  revokeReason: null,
  revokedById: null,
  deletedAt: null,
  expiresAt: null,
  fileUrl: null,
  pdfUrl: null,
  publicUrl: 'https://x/verify/INNOVA-123-ABCD',
  score: null,
  issuedById: 9,
  issuedAt: new Date('2026-03-01'),
  downloadCount: 0,
  verifyCount: 0,
  metadata: null,
  user: mockUser,
};

const mockPrisma = {
  user: { findUnique: jest.fn(), findMany: jest.fn() },
  course: { findUnique: jest.fn() },
  leadershipProgram: { findUnique: jest.fn() },
  certificateTemplate: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  certificate: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    aggregate: jest.fn(),
  },
  badge: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  badgeAward: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    count: jest.fn(),
  },
  auditLog: { create: jest.fn() },
  notificationLog: { create: jest.fn() },
  $transaction: jest.fn(),
};

const mockAudit = {
  logEntity: jest.fn((userId, action, entity, entityId, meta = {}) =>
    mockPrisma.auditLog.create({
      data: { userId, action, entity, metadata: JSON.stringify({ ...meta, entityId }) },
    }),
  ),
};

describe('CertificationService', () => {
  let service: CertificationService;

  beforeEach(async () => {
    Object.defineProperty(mockPrisma, 'read', {
      get() {
        return mockPrisma;
      },
      configurable: true,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get<CertificationService>(CertificationService);
    jest.clearAllMocks();
  });

  describe('issueCertificate', () => {
    it('deve emitir certificado (Certificate) com type traduzido e devolver a forma IssuedShape', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);
      mockPrisma.certificate.findFirst.mockResolvedValue(null);
      mockPrisma.certificate.create.mockResolvedValue({
        ...mockCert,
        type: 'LEADERSHIP',
        legacyType: 'PROGRAM',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.issueCertificate(
        { userId: 1, title: 'Curso Teste', type: 'PROGRAM' } as any,
        1,
      );
      expect(mockPrisma.certificate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'LEADERSHIP',
            legacyType: 'PROGRAM',
            issuedById: 1,
          }),
        }),
      );
      expect(result.code).toBe('CERT-00001');
      expect(result.verificationCode).toBe('INNOVA-123-ABCD');
      expect(result.isRevoked).toBe(false);
      expect(result.type).toBe('PROGRAM'); // legacyType round-trip
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
      mockPrisma.certificate.findFirst.mockResolvedValue(mockCert);
      mockPrisma.certificate.update.mockResolvedValue({});

      const result = await service.verify('INNOVA-123-ABCD');
      expect(result.valid).toBe(true);
      expect(result.certificate?.holder).toBe('João Teste');
    });

    it('deve retornar valid:false para código inválido', async () => {
      mockPrisma.certificate.findFirst.mockResolvedValue(null);
      const result = await service.verify('CODIGO-INVALIDO');
      expect(result.valid).toBe(false);
    });

    it('deve retornar valid:false para certificado revogado', async () => {
      mockPrisma.certificate.findFirst.mockResolvedValue({
        ...mockCert,
        revoked: true,
        revokedAt: new Date(),
      });
      const result = await service.verify('INNOVA-123-ABCD');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('revogado');
    });

    it('deve retornar valid:false para certificado expirado', async () => {
      mockPrisma.certificate.findFirst.mockResolvedValue({
        ...mockCert,
        expiresAt: new Date('2020-01-01'),
      });
      const result = await service.verify('INNOVA-123-ABCD');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expirado');
    });
  });

  describe('revokeCertificate', () => {
    it('deve revogar (revoked+revokedAt/revokeReason/revokedById) e notificar', async () => {
      mockPrisma.certificate.findFirst.mockResolvedValue(mockCert);
      mockPrisma.certificate.update.mockResolvedValue({ ...mockCert, revoked: true });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.revokeCertificate(
        'cert-1',
        { reason: 'Erro de emissão' },
        { id: 1, role: { name: 'ADMIN' } },
      );
      expect(mockPrisma.certificate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            revoked: true,
            revokeReason: 'Erro de emissão',
            revokedById: 1,
            revokedAt: expect.any(Date),
          }),
        }),
      );
      expect(result.isRevoked).toBe(true);
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'CERTIFICATE_REVOKED' }),
        }),
      );
    });

    it('deve lançar ConflictException se já revogado', async () => {
      mockPrisma.certificate.findFirst.mockResolvedValue({ ...mockCert, revoked: true });
      await expect(
        service.revokeCertificate(
          'cert-1',
          { reason: 'XXXXX' },
          { id: 1, role: { name: 'ADMIN' } },
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('downloadCertificate', () => {
    it('deve incrementar downloadCount e auditar', async () => {
      mockPrisma.certificate.findFirst.mockResolvedValue(mockCert);
      mockPrisma.certificate.update.mockResolvedValue({});
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.downloadCertificate('cert-1', {
        id: 1,
        role: { name: 'ADMIN' },
      });
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
    it('cria um Badge (não DigitalBadge) com código BDG- e legacyDigitalBadgeId, devolve a forma DigitalShape', async () => {
      mockPrisma.badge.findFirst.mockResolvedValue(null); // generateBadgeCode
      mockPrisma.badge.create.mockResolvedValue({
        id: 7,
        name: 'Líder',
        description: 'x',
        code: 'BDG-00001',
        imageUrl: 'http://i',
        criteria: 'y',
        skills: [],
        level: 'BASIC',
        issuerName: 'INNOVA',
        isActive: true,
        createdById: 1,
        deletedAt: null,
        legacyDigitalBadgeId: 'uuid-db-1',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createBadge(
        { name: 'Líder', description: 'x', imageUrl: 'http://i', criteria: 'y' },
        1,
      );
      expect(mockPrisma.badge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ code: 'BDG-00001', createdById: 1 }),
        }),
      );
      expect(result.code).toBe('BDG-00001');
      expect(result.id).toBe('uuid-db-1'); // legacyDigitalBadgeId dá o id string ao contrato
      expect(result.courseId).toBeNull();
    });
  });

  describe('issueBadge', () => {
    it('cria um BadgeAward (não BadgeIssuance) e devolve a forma IssuanceShape', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        { id: 5, name: 'Badge Teste', legacyDigitalBadgeId: 'db1' },
        { fullName: 'João Teste' },
      ]);
      mockPrisma.badgeAward.findUnique.mockResolvedValue(null);
      mockPrisma.badgeAward.create.mockResolvedValue({
        id: 1,
        badgeId: 5,
        userId: 1,
        awardedAt: new Date('2026-03-15'),
        isRevoked: false,
        verifyCode: 'BADGE-x',
        legacyBadgeIssuanceId: 'uuid-bi-1',
      });
      mockPrisma.auditLog.create.mockResolvedValue({});
      mockPrisma.notificationLog.create.mockResolvedValue({});

      const result = await service.issueBadge({ badgeId: 'db1', userId: 1 }, 9);
      expect(mockPrisma.badgeAward.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ badgeId: 5, userId: 1, issuedById: 9 }),
        }),
      );
      expect(result.id).toBe('uuid-bi-1');
      expect(result).toHaveProperty('verifyCode', 'BADGE-x');
      expect(result).toHaveProperty('isRevoked', false);
      expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: 'BADGE_EARNED' }),
        }),
      );
    });

    it('deve lançar ConflictException se já possui o badge (award activo)', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        { id: 5, name: 'Badge Teste', legacyDigitalBadgeId: 'db1' },
        { fullName: 'João Teste' },
      ]);
      mockPrisma.badgeAward.findUnique.mockResolvedValue({
        id: 9,
        deletedAt: null,
        isRevoked: false,
      });
      await expect(service.issueBadge({ badgeId: 'db1', userId: 1 }, 9)).rejects.toThrow(
        ConflictException,
      );
    });

    it('deve lançar NotFoundException se badge não existir', async () => {
      mockPrisma.$transaction.mockResolvedValue([null, { fullName: 'João' }]);
      await expect(service.issueBadge({ badgeId: 'nao-existe', userId: 1 }, 9)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getMyBadges', () => {
    it('lê BadgeAward (não BadgeIssuance) e devolve a forma IssuanceShape com badge', async () => {
      mockPrisma.badgeAward.findMany.mockResolvedValue([
        {
          id: 1,
          badgeId: 5,
          userId: 1,
          awardedAt: new Date('2026-03-15'),
          isRevoked: false,
          verifyCode: 'BADGE-x',
          legacyBadgeIssuanceId: 'bi1',
          badge: { id: 5, name: 'B', skills: [], level: 'BASIC', legacyDigitalBadgeId: 'db1' },
        },
      ]);
      const result = await service.getMyBadges(1);
      expect(mockPrisma.badgeAward.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 1, isRevoked: false }),
        }),
      );
      expect(result[0].id).toBe('bi1');
      expect(result[0].badgeId).toBe('db1');
      expect(result[0].badge?.id).toBe('db1');
    });
  });

  describe('getMyCertificates', () => {
    it('deve retornar certificados paginados do utilizador na forma IssuedShape', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockCert], 1]);
      const result = await service.getMyCertificates(1, { page: 1, limit: 20 });
      expect(result.total).toBe(1);
      expect((result.data as any[])[0]).toEqual(
        expect.objectContaining({ id: 'cert-1', verificationCode: 'INNOVA-123-ABCD' }),
      );
    });
  });

  describe('getDashboard', () => {
    it('deve retornar totais de certificados e badges', async () => {
      mockPrisma.read.certificate.groupBy.mockResolvedValue([]);
      mockPrisma.$transaction.mockResolvedValue([
        20,
        5,
        2,
        1,
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
