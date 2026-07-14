import { validate } from 'class-validator';
import { EmployeesCreateDocumentDto } from './employees.dto';

async function errorsFor(fileUrl: string, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const d = Object.assign(new EmployeesCreateDocumentDto(), {
    employeeId: 1,
    name: 'BI',
    type: 'IDENTITY',
    fileUrl,
  });
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'fileUrl');
}

describe('EmployeesCreateDocumentDto.fileUrl — IsAllowedFileUrl', () => {
  it('aceita URL válida', async () => {
    expect(await errorsFor('https://storage.innova.ao/bi.jpg')).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect((await errorsFor('http://storage.innova.ao/bi.jpg')).length).toBeGreaterThan(0);
  });
  it('recusa host não autorizado', async () => {
    expect((await errorsFor('https://evil.com/bi.jpg')).length).toBeGreaterThan(0);
  });
});
