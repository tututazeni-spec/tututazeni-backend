import { Test, TestingModule } from '@nestjs/testing';
import { PdfService } from './pdf.service';

describe('PdfService', () => {
  let service: PdfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PdfService],
    }).compile();
    service = module.get<PdfService>(PdfService);
  });

  describe('generateDeclarationPdf', () => {
    it('deve retornar buffer do PDF', async () => {
      const result = await service.generateDeclarationPdf({
        content: 'Conteúdo da declaração',
        config: { companyName: 'INNOVA' },
        declaration: { id: 1, code: 'DEC-001' },
      });
      expect(result).toBeDefined();
    });
  });

  describe('generateDeclaration', () => {
    it('deve gerar declaração em PDF', async () => {
      const result = await service.generateDeclaration({
        employeeName: 'João Silva',
        employeeId: 'EMP001',
        position: 'Developer',
        department: 'TI',
        startDate: '2020-01-01',
        purpose: 'Para efeitos legais',
      });
      expect(result).toBeDefined();
    });
  });
});

describe('PdfService — identidade do tenant no cabeçalho', () => {
  const PNG_1X1 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const mk = (logoUrl: string | null) =>
    ({
      tenantConfig: {
        findFirst: jest.fn().mockResolvedValue({ id: 't1' }),
        findUnique: jest.fn().mockResolvedValue({ tenantName: 'Acme Lda', logoUrl }),
      },
    }) as never;
  const exec = (svc: PdfService) =>
    svc.generateExecutiveReport({ title: 'R', period: '2026', metrics: [], sections: [] });

  it('gera PDF com o logo do tenant (e maior do que sem logo)', async () => {
    const { resetDefaultTenantCache } = await import('../common/helpers/tenant.helper');
    resetDefaultTenantCache();
    const withLogo = await exec(new PdfService(mk(PNG_1X1)));
    resetDefaultTenantCache();
    const without = await exec(new PdfService(mk(null)));
    expect(withLogo.subarray(0, 4).toString()).toBe('%PDF');
    expect(withLogo.length).toBeGreaterThan(without.length);
  });
});
