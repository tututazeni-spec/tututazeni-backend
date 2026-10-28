import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { SettingsController } from './settings.controller';
import { ROLES_KEY, CurrentUserData } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const HTTP = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

function routes() {
  const proto = SettingsController.prototype as unknown as Record<string, () => unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter(
      n => n !== 'constructor' && Reflect.getMetadata(METHOD_METADATA, proto[n]) !== undefined,
    )
    .map(name => ({
      name,
      method: HTTP[Reflect.getMetadata(METHOD_METADATA, proto[name])],
      path: Reflect.getMetadata(PATH_METADATA, proto[name]) as string,
      roles: Reflect.getMetadata(ROLES_KEY, proto[name]) as string[] | undefined,
    }));
}

describe('SettingsController — controlo de acesso', () => {
  // Rotas sem @Roles de propósito: branding é para qualquer utilizador autenticado
  // (cabeçalho/formatos) e security/me/* é autosserviço sobre o próprio utilizador.
  const isOpenToAuthenticated = (path: string) =>
    path === 'branding' || path.startsWith('security/me/') || path.startsWith('privacy/me/');

  it('exige JwtAuthGuard e RolesGuard ao nível da classe', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SettingsController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
  });

  it('descobre as rotas (protege contra o teste passar em vazio)', () => {
    expect(routes().length).toBeGreaterThan(60);
  });

  it('toda a rota exige ADMIN, excepto branding, security/me/* e privacy/me/*', () => {
    const unprotected = routes()
      .filter(r => !isOpenToAuthenticated(r.path) && !r.roles?.includes('ADMIN'))
      .map(r => `${r.method} ${r.path}`);
    expect(unprotected).toEqual([]);
  });

  it('as rotas abertas a qualquer autenticado são exactamente as esperadas', () => {
    const open = routes()
      .filter(r => !r.roles)
      .map(r => `${r.method} ${r.path}`)
      .sort();
    expect(open).toEqual(
      [
        'GET branding',
        'GET security/me/2fa',
        'POST security/me/2fa/setup',
        'POST security/me/2fa/enable',
        'POST security/me/2fa/disable',
        'GET security/me/sessions',
        'DELETE security/me/sessions/:id',
        'GET security/me/login-history',
        'GET privacy/me/export',
        'POST privacy/me/requests',
      ].sort(),
    );
  });

  it('só a visão de auditoria é partilhada com AUDITOR, e só ela', () => {
    const shared = routes().filter(r => r.roles && r.roles.some(x => x !== 'ADMIN'));
    expect(shared.map(r => `${r.method} ${r.path}`)).toEqual(['GET audit']);
    expect(shared[0].roles).toEqual(['ADMIN', 'AUDITOR']);
  });

  it('operações destrutivas (restore, flush de cache, filas) são só ADMIN', () => {
    const critical = routes().filter(
      r =>
        r.path.includes('restore') ||
        r.path.startsWith('system/cache') ||
        r.path.startsWith('system/queues'),
    );
    expect(critical.length).toBeGreaterThanOrEqual(6);
    for (const r of critical) expect(r.roles).toEqual(['ADMIN']);
  });
});

describe('SettingsController — delegação e lógica própria', () => {
  const user = { id: 7 } as CurrentUserData;
  const admin = { id: 1 } as CurrentUserData;
  let security: Record<string, jest.Mock>;
  let backups: Record<string, jest.Mock>;
  let system: Record<string, jest.Mock>;
  let privacy: Record<string, jest.Mock>;
  let integrations: Record<string, jest.Mock>;
  let svc: Record<string, jest.Mock>;
  let controller: SettingsController;

  const fn = (...names: string[]) =>
    Object.fromEntries(names.map(n => [n, jest.fn().mockResolvedValue(n)]));

  beforeEach(() => {
    svc = fn('getBranding', 'setDepartmentScope');
    security = fn(
      'getTwoFactorStatus',
      'setupTwoFactor',
      'enableTwoFactor',
      'disableTwoFactor',
      'listSessions',
      'revokeSession',
      'revokeAllUserSessions',
      'loginHistory',
    );
    backups = fn('runBackup', 'restore');
    system = fn('flushCache', 'setQueuePaused', 'cleanQueue', 'retryFailed');
    privacy = fn('listRequests');
    integrations = fn('testSmtp');
    controller = new SettingsController(
      svc as never,
      security as never,
      fn() as never,
      integrations as never,
      fn() as never,
      privacy as never,
      fn() as never,
      fn() as never,
      fn() as never,
      fn() as never,
      fn() as never,
      fn() as never,
      backups as never,
      system as never,
    );
  });

  describe('autosserviço de segurança usa sempre o utilizador autenticado', () => {
    it('2FA: estado, setup, activar e desactivar', async () => {
      await controller.my2fa(user);
      await controller.setup2fa(user);
      await controller.enable2fa({ code: '123456' }, user);
      await controller.disable2fa({ code: '654321' } as never, user);
      expect(security.getTwoFactorStatus).toHaveBeenCalledWith(7);
      expect(security.setupTwoFactor).toHaveBeenCalledWith(7);
      expect(security.enableTwoFactor).toHaveBeenCalledWith(7, '123456');
      expect(security.disableTwoFactor).toHaveBeenCalledWith(7, '654321');
    });

    it('lista só as minhas sessões', async () => {
      await controller.mySessions(user);
      expect(security.listSessions).toHaveBeenCalledWith(7);
    });

    it('terminar uma sessão própria activa ownerOnly (não revoga a de outros)', async () => {
      await controller.revokeMySession(55, user);
      expect(security.revokeSession).toHaveBeenCalledWith(55, 7, true);
    });

    it('o admin termina qualquer sessão (ownerOnly desligado)', async () => {
      await controller.revokeSession(55, admin);
      expect(security.revokeSession).toHaveBeenCalledWith(55, 1);
    });

    it('o meu histórico de logins fica fixado ao meu utilizador', async () => {
      await controller.myLoginHistory(user, '2');
      expect(security.loginHistory).toHaveBeenCalledWith({ userId: 7, page: 2 });
    });
  });

  describe('conversão de query strings', () => {
    it('sessions: userId opcional convertido para número', async () => {
      await controller.sessions('9');
      await controller.sessions();
      expect(security.listSessions).toHaveBeenNthCalledWith(1, 9);
      expect(security.listSessions).toHaveBeenNthCalledWith(2, undefined);
    });

    it('login-history do admin: só aceita SUCCESS/FAILED; qualquer outro valor é ignorado', async () => {
      await controller.loginHistory('3', 'SUCCESS', '1', '50');
      expect(security.loginHistory).toHaveBeenLastCalledWith({
        userId: 3,
        outcome: 'SUCCESS',
        page: 1,
        limit: 50,
      });
      await controller.loginHistory(undefined, "FAILED' OR 1=1", undefined, undefined);
      expect(security.loginHistory).toHaveBeenLastCalledWith({
        userId: undefined,
        outcome: undefined,
        page: undefined,
        limit: undefined,
      });
    });

    it('privacy/requests converte página e limite', async () => {
      await controller.listDataSubjectRequests('PENDING' as never, '2', '10');
      expect(privacy.listRequests).toHaveBeenCalledWith({
        status: 'PENDING',
        page: 2,
        limit: 10,
      });
    });
  });

  describe('operações de administração registam o admin autenticado', () => {
    it('backup manual, restauro, teste de SMTP', async () => {
      await controller.runBackup(admin);
      await controller.restoreBackup(4, { confirm: true } as never, admin);
      await controller.testSmtp({ to: 'a@b.c' } as never, admin);
      expect(backups.runBackup).toHaveBeenCalledWith('MANUAL', 1);
      expect(backups.restore).toHaveBeenCalledWith(4, { confirm: true }, 1);
      expect(integrations.testSmtp).toHaveBeenCalledWith('a@b.c', 1);
    });

    it('cache e filas: o nome da fila vem do path e o estado é o da acção', async () => {
      await controller.flushCache({ namespace: 'courses' } as never, admin);
      await controller.pauseQueue('mail', admin);
      await controller.resumeQueue('mail', admin);
      await controller.cleanQueue('mail', admin);
      await controller.retryFailed('mail', admin);
      expect(system.flushCache).toHaveBeenCalledWith('courses', 1);
      expect(system.setQueuePaused).toHaveBeenNthCalledWith(1, 'mail', true, 1);
      expect(system.setQueuePaused).toHaveBeenNthCalledWith(2, 'mail', false, 1);
      expect(system.cleanQueue).toHaveBeenCalledWith('mail', 1);
      expect(system.retryFailed).toHaveBeenCalledWith('mail', 1);
    });

    it('âmbito por departamento: usa o roleId do path e os ids do corpo', async () => {
      await controller.setDepartmentScope(3, { departmentIds: [1, 2] } as never, admin);
      expect(svc.setDepartmentScope).toHaveBeenCalledWith(3, [1, 2], 1);
    });

    it('propaga erros dos serviços (ex.: restauro recusado) sem os engolir', async () => {
      backups.restore.mockRejectedValue(new Error('confirmação em falta'));
      await expect(controller.restoreBackup(4, {} as never, admin)).rejects.toThrow(
        'confirmação em falta',
      );
    });
  });
});
