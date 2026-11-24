import { logoDataUrlToBuffer, resolveExportBranding } from './export-branding';

describe('export-branding', () => {
  it('converte data URL PNG/JPEG em Buffer e ignora SVG/vazio', () => {
    expect(logoDataUrlToBuffer('data:image/png;base64,QUJD')?.toString()).toBe('ABC');
    expect(logoDataUrlToBuffer('data:image/jpeg;base64,QUJD')).not.toBeNull();
    expect(logoDataUrlToBuffer('data:image/svg+xml;base64,QUJD')).toBeNull();
    expect(logoDataUrlToBuffer(null)).toBeNull();
  });

  it('sem prisma usa o nome de omissão', async () => {
    expect(await resolveExportBranding(null)).toEqual({ name: 'INNOVA', logo: null });
  });

  it('lê nome e logo do tenant', async () => {
    const prisma = {
      tenantConfig: {
        findFirst: jest.fn().mockResolvedValue({ id: 't1' }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ tenantName: ' Acme Lda ', logoUrl: 'data:image/png;base64,QUJD' }),
      },
    } as never;
    const b = await resolveExportBranding(prisma);
    expect(b.name).toBe('Acme Lda');
    expect(b.logo?.toString()).toBe('ABC');
  });

  it('falha da BD não rebenta a exportação', async () => {
    const prisma = {
      tenantConfig: { findFirst: jest.fn().mockRejectedValue(new Error('x')) },
    } as never;
    expect((await resolveExportBranding(prisma)).name).toBe('INNOVA');
  });
});
