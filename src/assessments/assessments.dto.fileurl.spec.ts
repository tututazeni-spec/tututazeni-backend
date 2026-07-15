import { validate } from 'class-validator';
import { AssessmentsAnswerDto } from './assessments.dto';

async function errorsFor(fileUrl: string | undefined, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const d = Object.assign(new AssessmentsAnswerDto(), { questionId: 1, fileUrl });
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'fileUrl');
}

describe('AssessmentsAnswerDto.fileUrl — IsAllowedFileUrl (opcional)', () => {
  it('aceita ausência de fileUrl (campo opcional)', async () => {
    expect(await errorsFor(undefined)).toHaveLength(0);
  });
  it('aceita URL válida quando presente', async () => {
    expect(await errorsFor('https://storage.innova.ao/resposta.jpg')).toHaveLength(0);
  });
  it('recusa http quando presente', async () => {
    expect((await errorsFor('http://storage.innova.ao/r.jpg')).length).toBeGreaterThan(0);
  });
  it('recusa host não autorizado quando presente', async () => {
    expect((await errorsFor('https://evil.com/r.jpg')).length).toBeGreaterThan(0);
  });
});
