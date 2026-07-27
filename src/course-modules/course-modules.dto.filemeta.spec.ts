import { validate } from 'class-validator';
import { CreateModuleMaterialDto } from './course-modules.dto';

function base(overrides: Record<string, unknown> = {}) {
  return Object.assign(new CreateModuleMaterialDto(), {
    title: 'Slides da aula 1',
    url: 'https://storage.innova.ao/slides.pdf',
    ...overrides,
  });
}

describe('CreateModuleMaterialDto.fileSizeKb — limites', () => {
  it('aceita ausência (campo opcional)', async () => {
    const errs = await validate(base());
    expect(errs.filter(e => e.property === 'fileSizeKb')).toHaveLength(0);
  });
  it('aceita valor dentro do limite', async () => {
    const errs = await validate(base({ fileSizeKb: 1024 }));
    expect(errs.filter(e => e.property === 'fileSizeKb')).toHaveLength(0);
  });
  it('recusa zero', async () => {
    const errs = await validate(base({ fileSizeKb: 0 }));
    expect(errs.filter(e => e.property === 'fileSizeKb').length).toBeGreaterThan(0);
  });
  it('recusa acima do máximo (200MB em KB)', async () => {
    const errs = await validate(base({ fileSizeKb: 200 * 1024 + 1 }));
    expect(errs.filter(e => e.property === 'fileSizeKb').length).toBeGreaterThan(0);
  });
});
