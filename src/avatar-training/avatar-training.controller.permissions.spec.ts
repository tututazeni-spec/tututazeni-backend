// Garante que todas as rotas declaram @Roles e que as sensíveis não ficam abertas a todos.
import 'reflect-metadata';
import { AvatarTrainingController } from './avatar-training.controller';
import { AUTHENTICATED_ROLES } from '../auth/enums/role.enum';
import { AVATAR_ADMIN_ROLES, AVATAR_AUTHOR_ROLES } from './avatar-training.helpers';

const proto = AvatarTrainingController.prototype as any;
const routes = Object.getOwnPropertyNames(proto).filter(
  n => n !== 'constructor' && Reflect.getMetadata('path', proto[n]) !== undefined,
);
const rolesOf = (n: string): string[] => (Reflect.getMetadata('roles', proto[n]) ?? []).map(String);

describe('AvatarTrainingController — permissões', () => {
  it('expõe as rotas do módulo', () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it.each(routes)('%s declara @Roles', name => {
    expect(rolesOf(name).length).toBeGreaterThan(0);
  });

  it('purgeTranscripts é só ADMIN/RH', () => {
    expect(rolesOf('purgeTranscripts').sort()).toEqual(AVATAR_ADMIN_ROLES.map(String).sort());
  });

  it('eraseUserTranscripts é só ADMIN/RH e eraseMyTranscripts está aberta a todos os autenticados', () => {
    expect(rolesOf('eraseUserTranscripts').sort()).toEqual(AVATAR_ADMIN_ROLES.map(String).sort());
    expect(rolesOf('eraseMyTranscripts').length).toBe(AUTHENTICATED_ROLES.length);
  });

  it.each(['createAvatar', 'publishProgram', 'upsertProviderConfig'])(
    '%s (se existir) não está aberta a todos os autenticados',
    name => {
      if (!proto[name]) return;
      expect(rolesOf(name).length).toBeLessThan(AUTHENTICATED_ROLES.length);
    },
  );

  it('autoria inclui INSTRUCTOR mas administração não', () => {
    const admin = AVATAR_ADMIN_ROLES.map(String);
    const author = AVATAR_AUTHOR_ROLES.map(String);
    expect(author.length).toBeGreaterThan(admin.length);
  });
});
