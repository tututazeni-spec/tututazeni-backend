import * as groups from './role-groups';

// Fixa a composição de cada grupo: alterar quem pertence a um grupo muda a
// autorização de todos os endpoints que o usam, por isso tem de ser deliberado.
describe('role-groups', () => {
  const sorted = (g: readonly string[]) => [...g].sort();

  it.each([
    ['ADMIN_RH_ROLES', ['ADMIN', 'RH']],
    ['ADMIN_RH_DIRECTOR_ROLES', ['ADMIN', 'DIRECTOR', 'RH']],
    ['ADMIN_DIRECTOR_ROLES', ['ADMIN', 'DIRECTOR']],
    ['ADMIN_RH_GESTOR_ROLES', ['ADMIN', 'GESTOR', 'RH']],
    ['ADMIN_RH_LIDER_GESTOR_ROLES', ['ADMIN', 'GESTOR', 'LIDER', 'RH']],
    ['ADMIN_RH_AUDITOR_ROLES', ['ADMIN', 'AUDITOR', 'RH']],
    ['ADMIN_RH_INSTRUCTOR_ROLES', ['ADMIN', 'INSTRUCTOR', 'RH']],
    ['ADMIN_RH_DIRECTOR_AUDITOR_ROLES', ['ADMIN', 'AUDITOR', 'DIRECTOR', 'RH']],
    ['ADMIN_RH_LEADERSHIP_ROLES', ['ADMIN', 'DIRECTOR', 'GESTOR', 'LIDER', 'RH']],
    [
      'ADMIN_RH_LEADERSHIP_INSTRUCTOR_ROLES',
      ['ADMIN', 'DIRECTOR', 'GESTOR', 'INSTRUCTOR', 'LIDER', 'RH'],
    ],
    ['DIRECTOR_GESTOR_LIDER_ROLES', ['DIRECTOR', 'GESTOR', 'LIDER']],
  ])('%s', (name, expected) => {
    expect(sorted((groups as Record<string, readonly string[]>)[name])).toEqual(expected);
  });

  it('não exporta grupos por fixar neste spec', () => {
    expect(Object.keys(groups)).toHaveLength(11);
  });
});
