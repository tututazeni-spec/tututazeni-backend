import { BadRequestException } from '@nestjs/common';
import { AuditExportsService } from './audit-exports.service';
import { pdf, png } from '../common/files/file-fixtures';
import { FILE_POLICIES } from '../common/files/file-policies';

const actor = { id: 1, ip: '127.0.0.1' } as never;
const b64 = (b: Buffer) => b.toString('base64');

function setup() {
  const prisma = {
    securityIncident: { count: jest.fn().mockResolvedValue(1) },
    internalAudit: { count: jest.fn().mockResolvedValue(1) },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new AuditExportsService(prisma as never, audit as never, {} as never);
  jest.spyOn(service as never, 'assertCan').mockResolvedValue(undefined as never);
  const saveFile = jest
    .spyOn(service, 'saveFile')
    .mockResolvedValue({ id: 9, code: 'EV-1', sha256: 'abc' } as never);
  return { service, saveFile };
}

const dto = (over: Record<string, unknown>) =>
  ({ incidentId: 1, fileName: 'prova.pdf', contentBase64: b64(pdf()), ...over }) as never;

describe('AuditExportsService.uploadEvidence — conteúdo real do ficheiro', () => {
  it('aceita um PDF verdadeiro e grava o MIME confirmado pelos bytes', async () => {
    const { service, saveFile } = setup();
    await service.uploadEvidence(dto({}), actor);
    expect(saveFile.mock.calls[0][0]).toMatchObject({ mimeType: 'application/pdf', format: 'pdf' });
  });

  it('sem mimeType, deduz-o dos bytes (PNG)', async () => {
    const { service, saveFile } = setup();
    await service.uploadEvidence(dto({ fileName: 'ecra.png', contentBase64: b64(png()) }), actor);
    expect(saveFile.mock.calls[0][0]).toMatchObject({ mimeType: 'image/png', format: 'other' });
  });

  it('o nome do ficheiro é sanitizado ao gravar', async () => {
    const { service, saveFile } = setup();
    await service.uploadEvidence(dto({ fileName: '../../etc/prova.pdf' }), actor);
    expect(saveFile.mock.calls[0][0]).toMatchObject({ fileName: 'prova.pdf' });
  });

  it.each([
    ['executável com nome .pdf', { contentBase64: b64(Buffer.from([0x4d, 0x5a, 0x90, 0x00, 1])) }],
    ['HTML declarado como PDF', { contentBase64: b64(Buffer.from('<html><script>x</script>')) }],
    ['PDF com JavaScript', { contentBase64: b64(pdf('/JS (x)')) }],
    ['mimeType que não corresponde aos bytes', { mimeType: 'image/png' }],
    ['mimeType fora da política (octet-stream)', { mimeType: 'application/octet-stream' }],
    ['binário desconhecido', { contentBase64: b64(Buffer.from([1, 0, 2, 0, 3])) }],
  ])('rejeita %s', async (_n, over) => {
    const { service, saveFile } = setup();
    await expect(service.uploadEvidence(dto(over), actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(saveFile).not.toHaveBeenCalled();
  });

  it('rejeita ficheiro vazio e acima do limite', async () => {
    const { service } = setup();
    await expect(service.uploadEvidence(dto({ contentBase64: '' }), actor)).rejects.toThrow(
      /vazio/,
    );
    const big = Buffer.concat([pdf(), Buffer.alloc(FILE_POLICIES.EVIDENCE.maxBytes)]);
    await expect(service.uploadEvidence(dto({ contentBase64: b64(big) }), actor)).rejects.toThrow(
      /excede/,
    );
  });
});
