import { canSeeFullProfile, redactUserProfile } from './user-profile-redaction';

const target = {
  id: 7,
  fullName: 'Ana',
  email: 'ana@innova.com',
  managerId: 3,
  nif: '123',
  nib: 'AO06...',
  identificationNumber: 'BI1',
  birthDate: new Date('1990-01-01'),
  address: 'Rua X',
  personalEmail: 'ana@gmail.com',
  phone: '9',
  emergencyContactName: 'Mãe',
  enrollments: [{ id: 1 }],
  certificates: [{ id: 1 }],
  userCompetencies: [{ id: 1 }],
  badgeAwards: [{ id: 1 }],
  subordinates: [{ id: 9 }],
  avatarUrl: 'a.png',
  department: { id: 1, name: 'TI' },
};

describe('canSeeFullProfile', () => {
  it.each(['ADMIN', 'RH', 'AUDITOR', 'DIRECTOR'])('%s vê o perfil completo', role => {
    expect(canSeeFullProfile({ id: 1, role: { name: role } } as never, target)).toBe(true);
  });
  it('o próprio e o chefe direto veem tudo', () => {
    expect(canSeeFullProfile({ id: 7, role: { name: 'COLABORADOR' } } as never, target)).toBe(true);
    expect(canSeeFullProfile({ id: 3, role: { name: 'GESTOR' } } as never, target)).toBe(true);
  });
  it('outros (colaborador, gestor de outra equipa, instrutor) não', () => {
    for (const role of ['COLABORADOR', 'GESTOR', 'LIDER', 'INSTRUCTOR']) {
      expect(canSeeFullProfile({ id: 99, role: { name: role } } as never, target)).toBe(false);
    }
  });
});

describe('redactUserProfile', () => {
  const r = redactUserProfile(target) as Record<string, unknown>;
  it('remove dados pessoais e financeiros', () => {
    for (const k of [
      'nif',
      'nib',
      'identificationNumber',
      'birthDate',
      'address',
      'personalEmail',
      'phone',
      'emergencyContactName',
    ]) {
      expect(r[k]).toBeUndefined();
    }
  });
  it('esvazia dados de aprendizagem/equipa mas mantém o formato (arrays vazios)', () => {
    for (const k of [
      'enrollments',
      'certificates',
      'userCompetencies',
      'badgeAwards',
      'subordinates',
    ]) {
      expect(r[k]).toEqual([]);
    }
  });
  it('mantém o necessário para pesquisas e cartões', () => {
    expect(r).toMatchObject({
      id: 7,
      fullName: 'Ana',
      email: 'ana@innova.com',
      avatarUrl: 'a.png',
    });
    expect(r.department).toEqual({ id: 1, name: 'TI' });
  });
});
