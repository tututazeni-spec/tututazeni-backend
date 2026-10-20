import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { CertificatesController } from './certificates.controller';

describe('CertificatesController — permissões dos modelos', () => {
  const rolesOf = (method: keyof CertificatesController): string[] =>
    Reflect.getMetadata(ROLES_KEY, CertificatesController.prototype[method]);

  it('restaurar uma versão é só para ADMIN e RH (o auditor não pode)', () => {
    expect(rolesOf('restoreTemplateVersion')).toEqual([Role.ADMIN, Role.RH]);
    expect(rolesOf('restoreTemplateVersion')).not.toContain(Role.AUDITOR);
  });
});
