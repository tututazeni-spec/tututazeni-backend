import { missingStartData, startRequirements } from './process-start-requirements';

describe('startRequirements', () => {
  it('módulos de RH exigem colaborador', () => {
    expect(startRequirements('Onboarding')).toEqual({ collaborator: true, entityType: null });
  });
  it('módulos com entidade exigem o tipo', () => {
    expect(startRequirements('Courses').entityType).toBe('Curso');
    expect(startRequirements('Documentos').entityType).toBe('Documento');
  });
  it('módulo desconhecido ou vazio não exige nada', () => {
    expect(startRequirements('Processes')).toEqual({ collaborator: false, entityType: null });
    expect(startRequirements(undefined)).toEqual({ collaborator: false, entityType: null });
  });
});

describe('missingStartData', () => {
  it('gestão sem colaborador falha; colaborador comum fica implícito', () => {
    const req = startRequirements('Users');
    expect(missingStartData(req, { actorIsManager: true })).toEqual(['colaborador']);
    expect(missingStartData(req, { actorIsManager: false })).toEqual([]);
    expect(missingStartData(req, { actorIsManager: true, targetUserId: 4 })).toEqual([]);
  });
  it('exige identificador da entidade', () => {
    const req = startRequirements('Courses');
    expect(missingStartData(req, { actorIsManager: true, sourceEntityId: '  ' })).toEqual([
      'identificador de curso',
    ]);
    expect(missingStartData(req, { actorIsManager: true, sourceEntityId: '12' })).toEqual([]);
  });
});
