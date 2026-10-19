import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CertificateLifecycleService } from './certificate-lifecycle.service';
import { ReasonDto } from './certificates-lifecycle.dto';

const DAY = 86_400_000;

describe('ReasonDto', () => {
  const check = (reason: string) => validate(plainToInstance(ReasonDto, { reason }));
  it('rejeita motivo curto (2) e longo (501)', async () => {
    expect((await check('ab')).length).toBeGreaterThan(0);
    expect((await check('x'.repeat(501))).length).toBeGreaterThan(0);
  });
  it('aceita 3 e 500 caracteres', async () => {
    expect(await check('abc')).toHaveLength(0);
    expect(await check('x'.repeat(500))).toHaveLength(0);
  });
});

describe('CertificateLifecycleService', () => {
  const prisma = {
    certificate: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    notificationLog: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { log: jest.fn() };
  const mail = { sendNotification: jest.fn() };
  const svc = new CertificateLifecycleService(prisma as never, audit as never, mail as never);

  const issuedAt = new Date('2026-01-01T00:00:00Z');
  const cert = (over: Record<string, unknown> = {}) => ({
    id: 5,
    userId: 1,
    origin: 'INTERNAL',
    status: 'ACTIVE',
    revoked: false,
    expiresAt: null,
    issuedAt,
    validationCode: 'OLDCODE123456789',
    type: 'COURSE',
    courseId: 10,
    eventId: null,
    activityKind: 'COURSE',
    activityId: 10,
    cycleKey: '1',
    dedupKey: '1:COURSE:10:1',
    title: 'Segurança',
    score: 80,
    hours: 8,
    issuerName: 'INNOVA',
    snapshot: JSON.stringify({ title: 'Segurança', hours: 8, score: 80, issuerName: 'INNOVA' }),
    user: { fullName: 'Ana Silva Atual', email: 'ana@x.com' },
    ...over,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.certificate.updateMany.mockResolvedValue({ count: 1 });
    prisma.certificate.update.mockResolvedValue({});
    prisma.certificate.create.mockImplementation(async ({ data }) => ({ id: 6, ...data }));
    prisma.notificationLog.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
    mail.sendNotification.mockResolvedValue(undefined);
  });

  describe('revoke', () => {
    it('certificado inexistente → 404', async () => {
      prisma.certificate.findUnique.mockResolvedValue(null);
      await expect(svc.revoke(5, 'motivo', 9)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('já revogado → 409 e nada é gravado nem auditado', async () => {
      prisma.certificate.findUnique.mockResolvedValue(cert({ revoked: true, status: 'REVOKED' }));
      await expect(svc.revoke(5, 'motivo', 9)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.certificate.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('perde a corrida (updateMany count 0) → 409', async () => {
      prisma.certificate.findUnique.mockResolvedValue(cert());
      prisma.certificate.updateMany.mockResolvedValue({ count: 0 });
      await expect(svc.revoke(5, 'motivo', 9)).rejects.toBeInstanceOf(ConflictException);
    });

    it('sucesso grava o motivo, audita e notifica o titular', async () => {
      prisma.certificate.findUnique
        .mockResolvedValueOnce(cert())
        .mockResolvedValueOnce(cert({ revoked: true }));
      await svc.revoke(5, 'Fraude comprovada', 9);
      expect(prisma.certificate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5, revoked: false },
          data: expect.objectContaining({
            revoked: true,
            status: 'REVOKED',
            revokeReason: 'Fraude comprovada',
            revokedById: 9,
          }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CERTIFICATE_REVOKED',
          entity: 'Certificate',
          entityId: 5,
          userId: 9,
          reason: 'Fraude comprovada',
          strict: true,
        }),
      );
      expect(prisma.notificationLog.create).toHaveBeenCalled();
    });
  });

  describe('reissue', () => {
    it.each([
      ['externo', cert({ origin: 'EXTERNAL' })],
      ['revogado', cert({ revoked: true, status: 'REVOKED' })],
      ['pendente de aprovação', cert({ status: 'PENDING_APPROVAL' })],
    ])('%s → 409', async (_n, c) => {
      prisma.certificate.findUnique.mockResolvedValue(c);
      await expect(svc.reissue(5, 'correcção', 9)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.certificate.create).not.toHaveBeenCalled();
    });

    it('revoga o original com "Reemitido:" e cria o novo ligado ao original', async () => {
      prisma.certificate.findUnique.mockResolvedValue(cert());
      const { original, replacement } = await svc.reissue(5, 'Nome corrigido', 9);
      expect(prisma.certificate.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5, revoked: false },
          data: expect.objectContaining({ revoked: true, status: 'REVOKED' }),
        }),
      );
      const revokeData = prisma.certificate.updateMany.mock.calls[0][0].data;
      expect(revokeData.revokeReason).toMatch(/^Reemitido: Nome corrigido/);
      expect(replacement).toMatchObject({
        replacesId: 5,
        cycleKey: '2',
        dedupKey: '1:COURSE:10:2',
        status: 'ACTIVE',
        recipientName: 'Ana Silva Atual',
      });
      expect(replacement.validationCode).not.toBe('OLDCODE123456789');
      expect(replacement.validationCode).toMatch(/^[0-9A-Z]{16}$/);
      expect(original.id).toBe(5);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CERTIFICATE_REISSUED',
          reason: 'Nome corrigido',
          strict: true,
        }),
      );
    });

    it('a reemissão mantém o template (id, versão e configuração) do original', async () => {
      const template = {
        id: 'tpl-3-executivo-premium',
        version: 2,
        config: { layoutKey: 'executivo-premium' },
      };
      prisma.certificate.findUnique.mockResolvedValue(
        cert({ snapshot: JSON.stringify({ title: 'Segurança', hours: 8, template }) }),
      );
      await svc.reissue(5, 'correcção', 9);
      expect(JSON.parse(prisma.certificate.create.mock.calls[0][0].data.snapshot).template).toEqual(
        template,
      );
    });

    it('o novo certificado fica na mesma matrícula e realização do original', async () => {
      prisma.certificate.findUnique.mockResolvedValue(
        cert({ enrollmentId: 77, enrollmentCycle: 2 }),
      );
      await svc.reissue(5, 'correcção', 9);
      expect(prisma.certificate.create.mock.calls[0][0].data).toMatchObject({
        enrollmentId: 77,
        enrollmentCycle: 2,
      });
    });

    it('conserva a duração da validade (365 dias)', async () => {
      prisma.certificate.findUnique.mockResolvedValue(
        cert({ expiresAt: new Date(issuedAt.getTime() + 365 * DAY) }),
      );
      const { replacement } = await svc.reissue(5, 'correcção', 9);
      const days = (replacement.expiresAt.getTime() - replacement.issuedAt.getTime()) / DAY;
      expect(days).toBeCloseTo(365, 5);
    });

    it('certificado legado sem dedupKey gera chave própria do ciclo', async () => {
      prisma.certificate.findUnique.mockResolvedValue(cert({ dedupKey: null, cycleKey: '1' }));
      const { replacement } = await svc.reissue(5, 'correcção', 9);
      expect(replacement.dedupKey).toBe('1:CERT:5:2');
    });

    it('P2002 na criação (reemissão concorrente) → 409', async () => {
      prisma.certificate.findUnique.mockResolvedValue(cert());
      prisma.certificate.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );
      await expect(svc.reissue(5, 'correcção', 9)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('resend', () => {
    it('só reenvia certificados activos', async () => {
      prisma.certificate.findUnique.mockResolvedValue(cert({ status: 'PENDING_APPROVAL' }));
      await expect(svc.resend(5, 9)).rejects.toBeInstanceOf(ConflictException);
    });

    it('SMTP a falhar não falha a operação', async () => {
      prisma.certificate.findUnique.mockResolvedValue(cert());
      mail.sendNotification.mockRejectedValue(new Error('smtp'));
      expect(await svc.resend(5, 9)).toEqual({ notified: true, emailed: false });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CERTIFICATE_RESENT' }),
      );
    });

    it('notifica e envia e-mail com a ligação de verificação', async () => {
      prisma.certificate.findUnique.mockResolvedValue(cert());
      expect(await svc.resend(5, 9)).toEqual({ notified: true, emailed: true });
      expect(mail.sendNotification).toHaveBeenCalledWith(
        'ana@x.com',
        expect.any(String),
        expect.stringContaining('/verify/OLDCODE123456789'),
      );
    });
  });
});
