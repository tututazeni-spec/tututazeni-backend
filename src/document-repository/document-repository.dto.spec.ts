import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  OptionalReasonDto,
  UpdateExpiresAtDto,
  ReasonDto,
  CreateDocumentDto,
  NewVersionDto,
} from './document-repository.dto';

describe('OptionalReasonDto', () => {
  it('sem reason passa (campo opcional)', async () => {
    const errors = await validate(plainToInstance(OptionalReasonDto, {}));
    expect(errors).toHaveLength(0);
  });

  it('reason válido passa', async () => {
    const errors = await validate(plainToInstance(OptionalReasonDto, { reason: 'Motivo válido' }));
    expect(errors).toHaveLength(0);
  });

  it('reason acima de 1000 chars falha', async () => {
    const errors = await validate(plainToInstance(OptionalReasonDto, { reason: 'a'.repeat(1001) }));
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('UpdateExpiresAtDto', () => {
  it('data ISO válida passa', async () => {
    const errors = await validate(
      plainToInstance(UpdateExpiresAtDto, { newExpiresAt: '2027-01-01T00:00:00.000Z' }),
    );
    expect(errors).toHaveLength(0);
  });

  it('string não-data falha', async () => {
    const errors = await validate(
      plainToInstance(UpdateExpiresAtDto, { newExpiresAt: 'não é uma data' }),
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('campo em falta falha', async () => {
    const errors = await validate(plainToInstance(UpdateExpiresAtDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('ReasonDto (document-repository)', () => {
  it('reason válido passa', async () => {
    const errors = await validate(plainToInstance(ReasonDto, { reason: 'Motivo' }));
    expect(errors).toHaveLength(0);
  });

  it('reason em falta falha', async () => {
    const errors = await validate(plainToInstance(ReasonDto, {}));
    expect(errors.length).toBeGreaterThan(0);
  });
});

async function errorsFor<T extends object>(instance: T, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const errs = await validate(instance);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'fileUrl');
}

describe('CreateDocumentDto.fileUrl — IsAllowedFileUrl', () => {
  const base = () =>
    Object.assign(new CreateDocumentDto(), {
      title: 'Doc',
      sensitivity: 'PUBLIC',
      mimeType: 'application/pdf',
    });

  it('aceita URL válida', async () => {
    expect(
      await errorsFor(Object.assign(base(), { fileUrl: 'https://storage.innova.ao/d.pdf' })),
    ).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect(
      (await errorsFor(Object.assign(base(), { fileUrl: 'http://storage.innova.ao/d.pdf' })))
        .length,
    ).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect(
      (await errorsFor(Object.assign(base(), { fileUrl: 'https://evil.com/d.pdf' }))).length,
    ).toBeGreaterThan(0);
  });
});

describe('NewVersionDto.fileUrl — IsAllowedFileUrl', () => {
  const base = () => Object.assign(new NewVersionDto(), { mimeType: 'application/pdf' });

  it('aceita URL válida', async () => {
    expect(
      await errorsFor(Object.assign(base(), { fileUrl: 'https://storage.innova.ao/v2.pdf' })),
    ).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect(
      (await errorsFor(Object.assign(base(), { fileUrl: 'http://evil.com/v2.pdf' }))).length,
    ).toBeGreaterThan(0);
  });
});
