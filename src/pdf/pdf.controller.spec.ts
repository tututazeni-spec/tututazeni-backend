import { Test, TestingModule } from '@nestjs/testing';
import { PdfController } from './pdf.controller';
import { PdfService } from './pdf.service';

const mockSvc = {
  generateDeclaration: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  generateCertificate: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  generatePayslip: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  generateExecutiveReport: jest.fn().mockResolvedValue(Buffer.from('pdf')),
};

const mockRes = {
  set: jest.fn(),
  end: jest.fn(),
};

describe('PdfController', () => {
  let controller: PdfController;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PdfController],
      providers: [{ provide: PdfService, useValue: mockSvc }],
    }).compile();
    controller = module.get<PdfController>(PdfController);
  });

  it('downloadDeclaration → generateDeclaration + res', async () => {
    await controller.downloadDeclaration('1', mockRes as any);
    expect(mockSvc.generateDeclaration).toHaveBeenCalled();
    expect(mockRes.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'Content-Type': 'application/pdf' }),
    );
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('downloadCertificate → generateCertificate + res', async () => {
    await controller.downloadCertificate('2', mockRes as any);
    expect(mockSvc.generateCertificate).toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('downloadPayslip → generatePayslip + res', async () => {
    await controller.downloadPayslip('3', mockRes as any);
    expect(mockSvc.generatePayslip).toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalled();
  });

  it('downloadReport → generateExecutiveReport + res', async () => {
    await controller.downloadReport('4', mockRes as any);
    expect(mockSvc.generateExecutiveReport).toHaveBeenCalled();
    expect(mockRes.end).toHaveBeenCalled();
  });
});
