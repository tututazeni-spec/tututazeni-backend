import { CertificateExpiryService, parseAlertDays } from './certificate-expiry.service';

const DAY = 86_400_000;

describe('parseAlertDays', () => {
  it('"30,7" → [7, 30] (ordem ascendente)', () => {
    expect(parseAlertDays('30,7')).toEqual([7, 30]);
  });
  it('descarta valores inválidos e repetidos', () => {
    expect(parseAlertDays('7, 30,abc,-1,0,7')).toEqual([7, 30]);
  });
  it.each([[undefined], [''], ['abc']])('%p usa os limiares por omissão', raw => {
    expect(parseAlertDays(raw)).toEqual([7, 30]);
  });
});

describe('CertificateExpiryService', () => {
  const prisma = {
    certificate: { updateMany: jest.fn(), findMany: jest.fn() },
    notificationLog: { create: jest.fn() },
  };
  const svc = new CertificateExpiryService(prisma as never);
  const now = new Date('2026-10-20T07:00:00Z');
  const row = (id: number, managerId: number | null = 50) => ({
    id,
    userId: 100 + id,
    title: 'Segurança',
    expiresAt: new Date(now.getTime() + 5 * DAY),
    user: { managerId, fullName: `Titular ${id}` },
  });

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.CERT_EXPIRY_ALERT_DAYS;
    prisma.certificate.updateMany.mockResolvedValue({ count: 1 });
    prisma.certificate.findMany.mockResolvedValue([]);
    prisma.notificationLog.create.mockResolvedValue({});
  });

  it('marca como EXPIRED os válidos com validade ultrapassada e conta-os', async () => {
    prisma.certificate.updateMany.mockResolvedValueOnce({ count: 4 });
    const r = await svc.runExpiryJob(now);
    expect(r.markedExpired).toBe(4);
    expect(prisma.certificate.updateMany.mock.calls[0][0]).toMatchObject({
      where: { status: 'ACTIVE', revoked: false, expiresAt: { lt: now } },
      data: { status: 'EXPIRED' },
    });
  });

  it('procura por limiares ascendentes (7 dias antes de 30) e só certificados válidos', async () => {
    await svc.runExpiryJob(now);
    const wheres = prisma.certificate.findMany.mock.calls.map(c => c[0].where);
    expect(wheres[0].expiresAt).toEqual({ gt: now, lte: new Date(now.getTime() + 7 * DAY) });
    expect(wheres[1].expiresAt).toEqual({ gt: now, lte: new Date(now.getTime() + 30 * DAY) });
    expect(wheres[0]).toMatchObject({ status: 'ACTIVE', revoked: false });
  });

  it('respeita CERT_EXPIRY_ALERT_DAYS', async () => {
    process.env.CERT_EXPIRY_ALERT_DAYS = '14';
    await svc.runExpiryJob(now);
    expect(prisma.certificate.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.certificate.findMany.mock.calls[0][0].where.expiresAt.lte).toEqual(
      new Date(now.getTime() + 14 * DAY),
    );
  });

  it('reclamação perdida (count 0, outra instância) → não notifica', async () => {
    prisma.certificate.findMany.mockResolvedValueOnce([row(1)]);
    prisma.certificate.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    const r = await svc.runExpiryJob(now);
    expect(r.alerted).toBe(0);
    expect(prisma.notificationLog.create).not.toHaveBeenCalled();
  });

  it('reclamação ganha → notifica o titular e o gestor, e grava o limiar', async () => {
    process.env.CERT_EXPIRY_ALERT_DAYS = '7';
    prisma.certificate.findMany.mockResolvedValueOnce([row(1)]);
    const r = await svc.runExpiryJob(now);
    expect(r.alerted).toBe(1);
    const targets = prisma.notificationLog.create.mock.calls
      .map(c => c[0].data.userId)
      .sort((a, b) => a - b);
    expect(targets).toEqual([50, 101]);
    expect(prisma.certificate.updateMany.mock.calls[1][0]).toMatchObject({
      where: { id: 1 },
      data: { lastExpiryAlertDays: 7 },
    });
  });

  it('sem gestor só notifica o titular', async () => {
    process.env.CERT_EXPIRY_ALERT_DAYS = '7';
    prisma.certificate.findMany.mockResolvedValueOnce([row(1, null)]);
    await svc.runExpiryJob(now);
    expect(prisma.notificationLog.create).toHaveBeenCalledTimes(1);
  });

  it('um certificado com erro não interrompe os seguintes', async () => {
    process.env.CERT_EXPIRY_ALERT_DAYS = '7';
    prisma.certificate.findMany.mockResolvedValueOnce([row(1), row(2)]);
    prisma.certificate.updateMany
      .mockResolvedValueOnce({ count: 0 }) // fase de expiração
      .mockRejectedValueOnce(new Error('BD indisponível')) // claim do 1.º
      .mockResolvedValueOnce({ count: 1 }); // claim do 2.º
    const r = await svc.runExpiryJob(now);
    expect(r.alerted).toBe(1);
  });

  it('lote cheio sem progresso não entra em ciclo infinito', async () => {
    process.env.CERT_EXPIRY_ALERT_DAYS = '7';
    prisma.certificate.findMany.mockResolvedValue(
      Array.from({ length: 200 }, (_, i) => row(i + 1)),
    );
    prisma.certificate.updateMany.mockResolvedValue({ count: 0 });
    await svc.runExpiryJob(now);
    expect(prisma.certificate.findMany.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
