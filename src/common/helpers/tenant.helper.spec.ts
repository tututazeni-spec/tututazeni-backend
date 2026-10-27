import { resolveDefaultTenantId } from './tenant.helper';
import type { PrismaService } from '../../prisma/prisma.service';

describe('resolveDefaultTenantId', () => {
  const mkPrisma = () =>
    ({
      tenantConfig: { findFirst: jest.fn(), create: jest.fn() },
    }) as unknown as PrismaService;

  it('devolve o tenantId explícito quando fornecido, sem tocar na BD', async () => {
    const prisma = mkPrisma();
    expect(await resolveDefaultTenantId(prisma, 'abc')).toBe('abc');
    expect(prisma.tenantConfig.findFirst).not.toHaveBeenCalled();
    expect(prisma.tenantConfig.create).not.toHaveBeenCalled();
  });

  it('devolve o id do TenantConfig existente', async () => {
    const prisma = mkPrisma();
    (prisma.tenantConfig.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
    expect(await resolveDefaultTenantId(prisma)).toBe('t1');
    expect(prisma.tenantConfig.create).not.toHaveBeenCalled();
  });

  it('cria o tenant DEFAULT quando não existe nenhum', async () => {
    const prisma = mkPrisma();
    (prisma.tenantConfig.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.tenantConfig.create as jest.Mock).mockResolvedValue({ id: 'tNew' });
    expect(await resolveDefaultTenantId(prisma)).toBe('tNew');
    expect(prisma.tenantConfig.create).toHaveBeenCalledWith({
      data: { tenantCode: 'DEFAULT', tenantName: 'Default Tenant' },
    });
  });

  it('memoriza o id: chamadas concorrentes e seguintes fazem uma só query', async () => {
    const prisma = mkPrisma();
    (prisma.tenantConfig.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
    const ids = await Promise.all(Array.from({ length: 20 }, () => resolveDefaultTenantId(prisma)));
    expect(ids).toEqual(Array(20).fill('t1'));
    await resolveDefaultTenantId(prisma);
    expect(prisma.tenantConfig.findFirst).toHaveBeenCalledTimes(1);
  });

  it('não memoriza falhas: a chamada seguinte tenta de novo', async () => {
    const prisma = mkPrisma();
    (prisma.tenantConfig.findFirst as jest.Mock)
      .mockRejectedValueOnce(new Error('BD em baixo'))
      .mockResolvedValueOnce({ id: 't1' });
    await expect(resolveDefaultTenantId(prisma)).rejects.toThrow('BD em baixo');
    expect(await resolveDefaultTenantId(prisma)).toBe('t1');
  });

  it('ignora string vazia como se fosse ausente', async () => {
    const prisma = mkPrisma();
    (prisma.tenantConfig.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
    expect(await resolveDefaultTenantId(prisma, '')).toBe('t1');
  });
});
