import { validate } from 'class-validator';
import { CreateDocumentDto, NewVersionDto } from './document-repository.dto';
import { DocCategoryType, DocSensitivity } from '@prisma/client';

async function errorsFor<T extends object>(instance: T, field: string, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const errs = await validate(instance);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === field);
}

function baseDoc(overrides: Record<string, unknown> = {}) {
  return Object.assign(new CreateDocumentDto(), {
    title: 'Doc',
    category: DocCategoryType.OTHER,
    sensitivity: DocSensitivity.PUBLIC,
    fileUrl: 'https://storage.innova.ao/d.pdf',
    mimeType: 'application/pdf',
    ...overrides,
  });
}

describe('CreateDocumentDto.mimeType — allowlist', () => {
  it('aceita application/pdf', async () => {
    expect(await errorsFor(baseDoc(), 'mimeType')).toHaveLength(0);
  });
  it('recusa executável (application/x-msdownload)', async () => {
    expect(
      (await errorsFor(baseDoc({ mimeType: 'application/x-msdownload' }), 'mimeType')).length,
    ).toBeGreaterThan(0);
  });
  it('recusa string arbitrária', async () => {
    expect(
      (await errorsFor(baseDoc({ mimeType: 'qualquer-coisa' }), 'mimeType')).length,
    ).toBeGreaterThan(0);
  });
});

describe('CreateDocumentDto.fileSize — limites', () => {
  it('aceita valor dentro do limite', async () => {
    expect(await errorsFor(baseDoc({ fileSize: 1024 }), 'fileSize')).toHaveLength(0);
  });
  it('recusa zero', async () => {
    expect((await errorsFor(baseDoc({ fileSize: 0 }), 'fileSize')).length).toBeGreaterThan(0);
  });
  it('recusa negativo', async () => {
    expect((await errorsFor(baseDoc({ fileSize: -1 }), 'fileSize')).length).toBeGreaterThan(0);
  });
  it('recusa acima do máximo (200MB)', async () => {
    expect(
      (await errorsFor(baseDoc({ fileSize: 200 * 1024 * 1024 + 1 }), 'fileSize')).length,
    ).toBeGreaterThan(0);
  });
});

describe('CreateDocumentDto.fileName — sem separadores de caminho', () => {
  it('aceita nome simples', async () => {
    expect(await errorsFor(baseDoc({ fileName: 'contrato.pdf' }), 'fileName')).toHaveLength(0);
  });
  it('recusa path traversal (../../etc/passwd)', async () => {
    expect(
      (await errorsFor(baseDoc({ fileName: '../../etc/passwd' }), 'fileName')).length,
    ).toBeGreaterThan(0);
  });
  it('recusa separador Windows', async () => {
    expect(
      (await errorsFor(baseDoc({ fileName: 'C:\\Windows\\evil.exe' }), 'fileName')).length,
    ).toBeGreaterThan(0);
  });
});

describe('NewVersionDto.mimeType — allowlist', () => {
  function base(overrides: Record<string, unknown> = {}) {
    return Object.assign(new NewVersionDto(), {
      fileUrl: 'https://storage.innova.ao/d.pdf',
      mimeType: 'application/pdf',
      changeDescription: 'nova versão',
      ...overrides,
    });
  }

  it('aceita application/pdf', async () => {
    expect(await errorsFor(base(), 'mimeType')).toHaveLength(0);
  });
  it('recusa tipo fora da allowlist', async () => {
    expect(
      (await errorsFor(base({ mimeType: 'application/x-sh' }), 'mimeType')).length,
    ).toBeGreaterThan(0);
  });
});
