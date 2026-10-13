import {
  computeReadiness,
  evaluateRequirement,
  evaluateRequirements,
  normalizeText,
  type CandidateProfile,
  type RequirementInput,
} from './position-requirements.evaluator';

const NOW = new Date('2026-10-12T00:00:00Z');

function profile(over: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    qualifications: [],
    languages: [],
    externalCertifications: [],
    platformCertificates: [],
    priorExperienceYears: null, // null = nunca preenchido
    hireDate: null,
    now: NOW,
    ...over,
  };
}

function req(over: Partial<RequirementInput>): RequirementInput {
  return {
    id: 1,
    category: 'ACADEMIC',
    title: 'x',
    level: null,
    minYears: null,
    mandatory: true,
    ...over,
  };
}

describe('normalizeText', () => {
  it('remove acentos, maiúsculas e espaços a mais', () => {
    expect(normalizeText('  Inglês   Técnico ')).toBe('ingles tecnico');
  });
});

describe('ACADEMIC', () => {
  const r = req({
    category: 'ACADEMIC',
    title: 'Licenciatura em Informática',
    level: 'LICENCIATURA',
  });

  it('NO_DATA sem habilitações', () => {
    expect(evaluateRequirement(r, profile()).status).toBe('NO_DATA');
  });
  it('MET quando o grau do curso certo é igual ou superior', () => {
    const p = profile({ qualifications: [{ degree: 'MESTRADO', course: 'Informática' }] });
    expect(evaluateRequirement(r, p).status).toBe('MET');
  });
  it('NOT_MET quando o grau é suficiente mas o curso é outro (Direito ≠ Informática)', () => {
    const p = profile({ qualifications: [{ degree: 'LICENCIATURA', course: 'Direito' }] });
    expect(evaluateRequirement(r, p).status).toBe('NOT_MET');
  });
  it('o curso combina sem acentos/maiúsculas e por inclusão nos dois sentidos', () => {
    const a = profile({
      qualifications: [{ degree: 'LICENCIATURA', course: 'ENGENHARIA INFORMATICA' }],
    });
    expect(evaluateRequirement({ ...r, title: 'Informática' }, a).status).toBe('MET'); // título contido no curso
    const b = profile({ qualifications: [{ degree: 'LICENCIATURA', course: 'informática' }] });
    expect(evaluateRequirement(r, b).status).toBe('MET'); // curso contido no título
  });
  it('usa o melhor grau entre os cursos que combinam, ignorando outros cursos', () => {
    const p = profile({
      qualifications: [
        { degree: 'DOUTORAMENTO', course: 'Direito' },
        { degree: 'BACHARELATO', course: 'Informática' },
      ],
    });
    const c = evaluateRequirement(r, p);
    expect(c.status).toBe('NOT_MET'); // o doutoramento é de outro curso
    expect(c.actual).toBe('BACHARELATO');
  });
  it('NOT_MET quando o grau do curso certo é inferior', () => {
    const p = profile({ qualifications: [{ degree: 'BACHARELATO', course: 'Informática' }] });
    const c = evaluateRequirement(r, p);
    expect(c.status).toBe('NOT_MET');
    expect(c.actual).toBe('BACHARELATO');
    expect(c.required).toBe('LICENCIATURA');
  });
  it('sem level exigido: qualquer grau do curso certo cumpre', () => {
    const p = profile({ qualifications: [{ degree: 'TECNICO', course: 'Informática' }] });
    expect(evaluateRequirement({ ...r, level: null }, p).status).toBe('MET');
  });
});

describe('EXPERIENCE', () => {
  const r = req({ category: 'EXPERIENCE', title: 'Experiência na área', minYears: 3 });

  it('NO_DATA sem hireDate e sem experiência anterior', () => {
    expect(evaluateRequirement(r, profile()).status).toBe('NO_DATA');
  });
  it('soma experiência anterior e antiguidade', () => {
    const p = profile({ priorExperienceYears: 1.5, hireDate: new Date('2025-04-12T00:00:00Z') });
    // 1.5 + ~1.5 = ~3.0 → MET
    expect(evaluateRequirement(r, p).status).toBe('MET');
  });
  it('antiguidade sozinha já chega: MET mesmo sem experiência anterior preenchida', () => {
    const p = profile({ hireDate: new Date('2020-01-01T00:00:00Z') });
    expect(evaluateRequirement(r, p).status).toBe('MET');
  });
  it('experiência anterior nunca preenchida + antiguidade insuficiente → NO_DATA (não NOT_MET)', () => {
    const p = profile({ hireDate: new Date('2025-10-12T00:00:00Z') });
    const c = evaluateRequirement(r, p);
    expect(c.status).toBe('NO_DATA');
    expect(c.actual).toBeNull();
  });
  it('experiência anterior preenchida a 0 + antiguidade insuficiente → NOT_MET', () => {
    const p = profile({ priorExperienceYears: 0, hireDate: new Date('2025-10-12T00:00:00Z') });
    expect(evaluateRequirement(r, p).status).toBe('NOT_MET');
  });
  it('NOT_MET quando o total é inferior ao mínimo', () => {
    const p = profile({ priorExperienceYears: 1, hireDate: new Date('2026-04-12T00:00:00Z') });
    const c = evaluateRequirement(r, p);
    expect(c.status).toBe('NOT_MET');
    expect(c.required).toBe('3 anos');
  });
});

describe('LANGUAGE', () => {
  const r = req({ category: 'LANGUAGE', title: 'Inglês', level: 'B2' });

  it('NO_DATA sem idiomas registados', () => {
    expect(evaluateRequirement(r, profile()).status).toBe('NO_DATA');
  });
  it('MET com nível igual ou superior (match sem acentos/maiúsculas)', () => {
    const p = profile({ languages: [{ language: 'ingles', level: 'C1' }] });
    expect(evaluateRequirement(r, p).status).toBe('MET');
  });
  it('NOT_MET com nível inferior', () => {
    const p = profile({ languages: [{ language: 'Inglês', level: 'B1' }] });
    expect(evaluateRequirement(r, p).status).toBe('NOT_MET');
  });
  it('NOT_MET quando tem outros idiomas mas não este', () => {
    const p = profile({ languages: [{ language: 'Francês', level: 'C2' }] });
    expect(evaluateRequirement(r, p).status).toBe('NOT_MET');
  });
});

describe('CERTIFICATION', () => {
  const r = req({ category: 'CERTIFICATION', title: 'AWS Cloud' });

  it('NO_DATA sem nenhuma certificação', () => {
    expect(evaluateRequirement(r, profile()).status).toBe('NO_DATA');
  });
  it('MET por certificação externa válida (match normalizado)', () => {
    const p = profile({ externalCertifications: [{ name: 'aws  CLOUD', expiresAt: null }] });
    expect(evaluateRequirement(r, p).status).toBe('MET');
  });
  it('externa expirada não conta', () => {
    const p = profile({
      externalCertifications: [{ name: 'AWS Cloud', expiresAt: new Date('2026-01-01T00:00:00Z') }],
    });
    expect(evaluateRequirement(r, p).status).toBe('NOT_MET');
  });
  it('certificado da plataforma conta; revogado ou expirado não', () => {
    const ok = profile({
      platformCertificates: [{ title: 'AWS Cloud', expiresAt: null, revoked: false }],
    });
    const revoked = profile({
      platformCertificates: [{ title: 'AWS Cloud', expiresAt: null, revoked: true }],
    });
    const expired = profile({
      platformCertificates: [
        { title: 'AWS Cloud', expiresAt: new Date('2026-01-01T00:00:00Z'), revoked: false },
      ],
    });
    expect(evaluateRequirement(r, ok).status).toBe('MET');
    expect(evaluateRequirement(r, revoked).status).toBe('NOT_MET');
    expect(evaluateRequirement(r, expired).status).toBe('NOT_MET');
  });
});

describe('computeReadiness', () => {
  const check = (status: 'MET' | 'NOT_MET' | 'NO_DATA', mandatory: boolean) => ({
    requirementId: 1,
    category: 'LANGUAGE' as const,
    title: 't',
    mandatory,
    status,
    required: 'r',
    actual: null,
  });

  it('sem competências nem requisitos devolve 100 (comportamento actual)', () => {
    expect(computeReadiness(0, 0, []).readinessScore).toBe(100);
  });
  it('soma competências cumpridas e requisitos obrigatórios com dados', () => {
    const r = computeReadiness(2, 4, [check('MET', true), check('NOT_MET', true)]);
    // (2 + 1) / (4 + 2) = 50%
    expect(r.readinessScore).toBe(50);
  });
  it('NO_DATA e diferenciais não baixam a nota, mas são contados à parte', () => {
    const r = computeReadiness(1, 1, [
      check('NO_DATA', true),
      check('NOT_MET', false),
      check('MET', false),
    ]);
    expect(r.readinessScore).toBe(100);
    expect(r.noData).toBe(1);
    expect(r.optionalTotal).toBe(2);
    expect(r.optionalMet).toBe(1);
  });
});

describe('evaluateRequirements', () => {
  it('preserva a ordem e devolve um check por requisito', () => {
    const out = evaluateRequirements([req({ id: 5 }), req({ id: 6 })], profile());
    expect(out.map(c => c.requirementId)).toEqual([5, 6]);
  });
});
