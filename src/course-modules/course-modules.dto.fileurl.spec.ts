import { validate } from 'class-validator';
import { CreateModuleMaterialDto } from './course-modules.dto';

async function errorsFor(url: string, host = 'storage.innova.ao') {
  const prev = process.env.ALLOWED_FILE_HOST;
  process.env.ALLOWED_FILE_HOST = host;
  const d = Object.assign(new CreateModuleMaterialDto(), { title: 'Slides', url });
  const errs = await validate(d);
  process.env.ALLOWED_FILE_HOST = prev ?? '';
  return errs.filter(e => e.property === 'url');
}

describe('CreateModuleMaterialDto.url — IsAllowedFileUrl', () => {
  it('aceita URL válida com host permitido', async () => {
    expect(await errorsFor('https://storage.innova.ao/slides.pdf')).toHaveLength(0);
  });
  it('recusa http', async () => {
    expect((await errorsFor('http://storage.innova.ao/slides.pdf')).length).toBeGreaterThan(0);
  });
  it('recusa host não autorizado (ex: link externo do YouTube)', async () => {
    expect((await errorsFor('https://youtube.com/watch?v=abc')).length).toBeGreaterThan(0);
  });
});
