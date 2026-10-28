import { FeatureFlagsService } from './feature-flags.service';

describe('FeatureFlagsService', () => {
  const make = (raw: string) => {
    process.env.FEATURE_FLAGS = raw;
    return new FeatureFlagsService();
  };
  afterEach(() => delete process.env.FEATURE_FLAGS);

  it('flag inexistente está desligada', () => {
    expect(make('').isEnabled('x', 'u1')).toBe(false);
  });

  it('on/off', () => {
    const s = make('a:on,b:off');
    expect(s.isEnabled('a')).toBe(true);
    expect(s.isEnabled('b', 'u1')).toBe(false);
  });

  it('percentagem é estável por utilizador e exige userId', () => {
    const s = make('p:50');
    expect(s.isEnabled('p')).toBe(false);
    expect(s.isEnabled('p', 'u1')).toBe(s.isEnabled('p', 'u1'));
    const on = Array.from({ length: 1000 }, (_, i) => s.isEnabled('p', `user-${i}`)).filter(
      Boolean,
    ).length;
    expect(on).toBeGreaterThan(400);
    expect(on).toBeLessThan(600);
  });

  it('ignora lixo e limita a 0-100', () => {
    const s = make('a:abc,b:250,:on, c:-5');
    expect(s.snapshot()).toEqual({ b: 100, c: 0 });
  });
});
