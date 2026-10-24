import 'reflect-metadata';
import { THROTTLER_LIMIT, THROTTLER_TTL } from '@nestjs/throttler/dist/throttler.constants';
import { PublicCertificatesController } from './public-certificates.controller';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

/**
 * Endpoint sem autenticação: o código de validação é a única credencial, por isso
 * o limite por IP (anti-enumeração) e o formato da resposta fazem parte do contrato.
 */
describe('PublicCertificatesController', () => {
  const proto = PublicCertificatesController.prototype;
  let certificates: { verifyPublic: jest.Mock; getPublicPdf: jest.Mock };
  let controller: PublicCertificatesController;

  beforeEach(() => {
    certificates = { verifyPublic: jest.fn(), getPublicPdf: jest.fn() };
    controller = new PublicCertificatesController(certificates as never);
  });

  describe.each(['verify', 'pdf'] as const)('rota %s', name => {
    it('é pública (não exige sessão)', () => {
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, proto[name])).toBe(true);
    });

    it('está limitada a 30 pedidos por minuto', () => {
      expect(Reflect.getMetadata(`${THROTTLER_LIMIT}default`, proto[name])).toBe(30);
      expect(Reflect.getMetadata(`${THROTTLER_TTL}default`, proto[name])).toBe(60_000);
    });
  });

  it('verify devolve o resultado do serviço sem o alterar', async () => {
    certificates.verifyPublic.mockResolvedValue({ valid: true, holder: 'A. Silva' });
    await expect(controller.verify('CODE-1')).resolves.toEqual({ valid: true, holder: 'A. Silva' });
    expect(certificates.verifyPublic).toHaveBeenCalledWith('CODE-1');
  });

  it('verify propaga o erro do serviço (código inexistente) em vez de responder 200', async () => {
    certificates.verifyPublic.mockRejectedValue(new Error('not found'));
    await expect(controller.verify('NOPE')).rejects.toThrow('not found');
  });

  describe('pdf', () => {
    const makeRes = () => ({ set: jest.fn(), end: jest.fn() });

    it('envia o PDF como anexo com tamanho correcto', async () => {
      const buf = Buffer.from('%PDF-1.4 fake');
      certificates.getPublicPdf.mockResolvedValue(buf);
      const res = makeRes();

      await controller.pdf('CODE-1', res as never);

      expect(certificates.getPublicPdf).toHaveBeenCalledWith('CODE-1');
      expect(res.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="certificado.pdf"',
        'Content-Length': buf.length,
      });
      expect(res.end).toHaveBeenCalledWith(buf);
    });

    it('certificado inválido/revogado: não escreve cabeçalhos nem corpo', async () => {
      certificates.getPublicPdf.mockRejectedValue(new Error('revogado'));
      const res = makeRes();
      await expect(controller.pdf('BAD', res as never)).rejects.toThrow('revogado');
      expect(res.set).not.toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });
  });
});
