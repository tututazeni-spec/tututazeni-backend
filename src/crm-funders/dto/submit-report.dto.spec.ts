import { validate } from 'class-validator';
import { SubmitFunderReportDto } from './submit-report.dto';

async function errorsFor(fileUrl: string, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const d = Object.assign(new SubmitFunderReportDto(), { fileUrl });
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'fileUrl');
}

describe('SubmitFunderReportDto.fileUrl — IsAllowedFileUrl', () => {
  it('aceita URL válida com host permitido', async () => {
    expect(await errorsFor('https://storage.innova.ao/reports/q2.pdf')).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect((await errorsFor('http://storage.innova.ao/reports/q2.pdf')).length).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect((await errorsFor('https://evil.com/reports/q2.pdf')).length).toBeGreaterThan(0);
  });
  it('recusa string vazia', async () => {
    expect((await errorsFor('')).length).toBeGreaterThan(0);
  });
});
