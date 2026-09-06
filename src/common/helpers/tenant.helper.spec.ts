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

  it('ignora string vazia como se fosse ausente', async () => {
    const prisma = mkPrisma();
    (prisma.tenantConfig.findFirst as jest.Mock).mockResolvedValue({ id: 't1' });
    expect(await resolveDefaultTenantId(prisma, '')).toBe('t1');
  });
});
