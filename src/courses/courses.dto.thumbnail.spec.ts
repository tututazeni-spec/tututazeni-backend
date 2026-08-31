import { validate } from 'class-validator';
import { CreateCourseDto, UpdateCourseDto } from './courses.dto';

// A imagem do curso (opcional) chega como data URL base64 ou como URL normal
// e é guardada tal e qual em Course.thumbnailUrl. O único limite no backend é
// o comprimento — este @MaxLength é a fronteira real (o body parser em main.ts
// só corta muito acima disto). Ver [[project-innova-user-avatar-upload]].
const MAX = 700_000;

async function thumbErrors(value: unknown) {
  const dto = Object.assign(new CreateCourseDto(), { title: 'Curso X', thumbnailUrl: value });
  const errs = await validate(dto);
  return errs.filter(e => e.property === 'thumbnailUrl');
}

describe('CreateCourseDto.thumbnailUrl', () => {
  it('é opcional — sem thumbnailUrl não gera erro', async () => {
    const dto = Object.assign(new CreateCourseDto(), { title: 'Curso X' });
    const errs = await validate(dto);
    expect(errs.filter(e => e.property === 'thumbnailUrl')).toHaveLength(0);
  });

  it('aceita uma URL normal curta', async () => {
    expect(await thumbErrors('https://cdn.innova.ao/cursos/x.jpg')).toHaveLength(0);
  });

  it('aceita uma data URL base64 dentro do limite', async () => {
    const dataUrl = `data:image/jpeg;base64,${'A'.repeat(400_000)}`;
    expect(await thumbErrors(dataUrl)).toHaveLength(0);
  });

  it('recusa uma string acima do limite de comprimento', async () => {
    expect((await thumbErrors('x'.repeat(MAX + 1))).length).toBeGreaterThan(0);
  });

  it('recusa um valor não-string', async () => {
    expect((await thumbErrors(12345)).length).toBeGreaterThan(0);
  });
});

describe('UpdateCourseDto.thumbnailUrl', () => {
  it('herda o limite de comprimento via PartialType', async () => {
    const dto = Object.assign(new UpdateCourseDto(), { thumbnailUrl: 'x'.repeat(MAX + 1) });
    const errs = await validate(dto);
    expect(errs.filter(e => e.property === 'thumbnailUrl').length).toBeGreaterThan(0);
  });

  it('aceita null para limpar a imagem', async () => {
    const dto = Object.assign(new UpdateCourseDto(), { thumbnailUrl: null });
    const errs = await validate(dto);
    expect(errs.filter(e => e.property === 'thumbnailUrl')).toHaveLength(0);
  });
});
