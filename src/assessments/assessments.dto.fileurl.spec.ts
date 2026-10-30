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
  it('aceita um PDF inline (data URL) e recusa um tipo não permitido', async () => {
    const pdf =
      'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%%EOF\n').toString('base64');
    expect(await errorsFor(pdf)).toHaveLength(0);
    const exe = 'data:application/x-msdownload;base64,' + Buffer.from('MZ').toString('base64');
    expect((await errorsFor(exe)).length).toBeGreaterThan(0);
  });
});
