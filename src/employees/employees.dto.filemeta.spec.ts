import { validate } from 'class-validator';
import { EmployeesCreateDocumentDto } from './employees.dto';

async function errorsFor<T extends object>(instance: T, field: string, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const errs = await validate(instance);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === field);
}

function base(overrides: Record<string, unknown> = {}) {
  return Object.assign(new EmployeesCreateDocumentDto(), {
    employeeId: 1,
    name: 'Contrato',
    type: 'CONTRACT',
    fileUrl: 'https://storage.innova.ao/d.pdf',
    ...overrides,
  });
}

describe('EmployeesCreateDocumentDto.mimeType — allowlist', () => {
  it('aceita ausência (campo opcional)', async () => {
    expect(await errorsFor(base(), 'mimeType')).toHaveLength(0);
  });
  it('aceita application/pdf', async () => {
    expect(await errorsFor(base({ mimeType: 'application/pdf' }), 'mimeType')).toHaveLength(0);
  });
  it('recusa executável', async () => {
    expect(
      (await errorsFor(base({ mimeType: 'application/x-msdownload' }), 'mimeType')).length,
    ).toBeGreaterThan(0);
  });
});

describe('EmployeesCreateDocumentDto.fileSize — limites', () => {
  it('aceita valor dentro do limite', async () => {
    expect(await errorsFor(base({ fileSize: 2048 }), 'fileSize')).toHaveLength(0);
  });
  it('recusa zero', async () => {
    expect((await errorsFor(base({ fileSize: 0 }), 'fileSize')).length).toBeGreaterThan(0);
  });
  it('recusa acima do máximo', async () => {
    expect(
      (await errorsFor(base({ fileSize: 200 * 1024 * 1024 + 1 }), 'fileSize')).length,
    ).toBeGreaterThan(0);
  });
});
