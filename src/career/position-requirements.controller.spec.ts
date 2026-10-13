import 'reflect-metadata';
import { ROLES_KEY } from '../common/decorators';
import { PositionRequirementsController } from './position-requirements.controller';

// Escrever requisitos permite sondar o perfil de qualquer colaborador através do
// simulador (criar "Inglês C2" e ver MET/NOT_MET) — por isso só ADMIN/RH escrevem.
describe('PositionRequirementsController — papéis de escrita', () => {
  const proto = PositionRequirementsController.prototype;
  const rolesOf = (fn: unknown) => Reflect.getMetadata(ROLES_KEY, fn as object) as string[];

  it.each(['create', 'update', 'remove'] as const)('%s é só ADMIN e RH', m => {
    expect([...rolesOf(proto[m])].sort()).toEqual(['ADMIN', 'RH']);
  });
});
