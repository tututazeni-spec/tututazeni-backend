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
