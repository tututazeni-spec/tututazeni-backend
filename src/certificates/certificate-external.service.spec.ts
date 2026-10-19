import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CertificateExternalService } from './certificate-external.service';
import { ImportExternalCertificateDto } from './certificates-lifecycle.dto';

const PDF = `data:application/pdf;base64,${Buffer.from('%PDF-1.4 teste').toString('base64')}`;

const dtoOf = (over: Record<string, unknown> = {}) =>
  plainToInstance(ImportExternalCertificateDto, {
    userId: 1,
    title: 'Primeiros Socorros',
    issuerName: 'Cruz Vermelha',
    completedAt: '2026-03-01',
    document: PDF,
    ...over,
  });

describe('ImportExternalCertificateDto', () => {
  it('aceita um caso válido', async () => {
    expect(await validate(dtoOf())).toHaveLength(0);
  });

  it('rejeita imagem (só PDF)', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    expect((await validate(dtoOf({ document: png }))).length).toBeGreaterThan(0);
  });

  it('rejeita PDF acima de 5 MB', async () => {
    const big = `data:application/pdf;base64,${'A'.repeat(7_300_000)}`;
    expect((await validate(dtoOf({ document: big }))).length).toBeGreaterThan(0);
  });

  it('rejeita ligação que não seja um PDF carregado', async () => {
    expect(
      (await validate(dtoOf({ document: 'https://exemplo.com/c.pdf' }))).length,
    ).toBeGreaterThan(0);
  });

  it('rejeita horas negativas e título vazio', async () => {
    expect((await validate(dtoOf({ hours: -1 }))).length).toBeGreaterThan(0);
    expect((await validate(dtoOf({ title: '' }))).length).toBeGreaterThan(0);
  });
});

describe('CertificateExternalService', () => {
  const prisma = {
    user: { findUnique: jest.fn() },
    certificate: { create: jest.fn(), findUnique: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const svc = new CertificateExternalService(prisma as never, audit as never);

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.user.findUnique.mockResolvedValue({ id: 1, fullName: 'Ana Silva' });
    prisma.certificate.create.mockImplementation(async ({ data }) => ({ id: 3, ...data }));
  });

  it('titular inexistente → 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(svc.importExternal(dtoOf(), 9)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('validade anterior à conclusão → 400', async () => {
    await expect(
      svc.importExternal(dtoOf({ completedAt: '2026-03-01', expiresAt: '2026-01-01' }), 9),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });

  it('por omissão fica a aguardar validação', async () => {
    const r = await svc.importExternal(dtoOf(), 9);
    expect(r.outcome).toBe('IMPORTED');
    expect(prisma.certificate.create.mock.calls[0][0].data).toMatchObject({
      origin: 'EXTERNAL',
      status: 'PENDING_APPROVAL',
      userId: 1,
      title: 'Primeiros Socorros',
      issuerName: 'Cruz Vermelha',
      recipientName: 'Ana Silva',
      fileUrl: PDF,
    });
  });

  it('validated:true entra como ACTIVE e audita', async () => {
    await svc.importExternal(dtoOf({ validated: true, hours: 12, observations: 'ok' }), 9);
    const data = prisma.certificate.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'ACTIVE', hours: 12, observations: 'ok' });
    expect(data.validationCode).toMatch(/^[0-9A-Z]{16}$/);
    expect(data.dedupKey).toMatch(/^1:EXTERNAL:[0-9a-f]{40}$/);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CERTIFICATE_EXTERNAL_IMPORTED', userId: 9, strict: true }),
    );
  });

  it('o mesmo certificado duas vezes gera a mesma dedupKey', async () => {
    await svc.importExternal(dtoOf(), 9);
    await svc.importExternal(dtoOf(), 9);
    const [a, b] = prisma.certificate.create.mock.calls.map(c => c[0].data.dedupKey);
    expect(a).toBe(b);
  });

  it('P2002 → EXISTS com o registo já importado e sem nova auditoria', async () => {
    prisma.certificate.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    prisma.certificate.findUnique.mockResolvedValue({ id: 8 });
    const r = await svc.importExternal(dtoOf(), 9);
    expect(r).toMatchObject({ outcome: 'EXISTS', certificate: { id: 8 } });
    expect(audit.log).not.toHaveBeenCalled();
  });
});
