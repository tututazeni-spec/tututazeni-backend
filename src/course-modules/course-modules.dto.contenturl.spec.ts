import { validate } from 'class-validator';
import { CreateModuleLessonDto } from './course-modules.dto';

function base(overrides: Record<string, unknown> = {}) {
  return Object.assign(new CreateModuleLessonDto(), {
    moduleId: 1,
    title: 'Aula PDF',
    contentType: 'PDF',
    seq: 1,
    ...overrides,
  });
}

describe('CreateModuleLessonDto.contentUrl — limite de tamanho', () => {
  it('aceita ausência (campo opcional)', async () => {
    const errs = await validate(base());
    expect(errs.filter(e => e.property === 'contentUrl')).toHaveLength(0);
  });

  it('aceita um data URL de PDF dentro do limite', async () => {
    const dataUrl = 'data:application/pdf;base64,' + 'A'.repeat(1000);
    const errs = await validate(base({ contentUrl: dataUrl }));
    expect(errs.filter(e => e.property === 'contentUrl')).toHaveLength(0);
  });

  it('recusa um contentUrl acima do limite (~7MB)', async () => {
    const tooBig = 'data:application/pdf;base64,' + 'A'.repeat(7_000_001);
    const errs = await validate(base({ contentUrl: tooBig }));
    expect(errs.filter(e => e.property === 'contentUrl').length).toBeGreaterThan(0);
  });
});
