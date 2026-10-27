import { computeNps, normalizePath } from './product-experience.math';

describe('product-experience.math', () => {
  it('NPS = promotores% − detratores%', () => {
    // 2 promotores, 1 passivo, 1 detrator → (2-1)/4 = 25
    expect(computeNps([10, 9, 8, 3])).toEqual({
      nps: 25,
      promoters: 2,
      passives: 1,
      detractors: 1,
      total: 4,
    });
  });

  it('NPS sem respostas é null', () => {
    expect(computeNps([]).nps).toBeNull();
  });

  it('normalizePath agrega ids e remove query', () => {
    expect(normalizePath('/courses/42/learn?tab=2#x')).toBe('/courses/:id/learn');
    expect(normalizePath('/users/3f2b8c1e-aaaa-bbbb-cccc-1234567890ab')).toBe('/users/:id');
  });

  it('normalizePath rejeita valores que não são caminhos', () => {
    expect(normalizePath('https://x.com')).toBeNull();
    expect(normalizePath(undefined)).toBeNull();
  });
});
