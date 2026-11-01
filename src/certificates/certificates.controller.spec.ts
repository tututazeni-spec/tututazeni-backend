import 'reflect-metadata';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { CertificatesController } from './certificates.controller';
import { CurrentUserData, ROLES_KEY } from '../common/decorators';
import { AUTHENTICATED_ROLES } from '../auth/enums/role.enum';
import { UPLOAD_THROTTLE_KEY } from '../common/security/upload-throttle';

const HTTP = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const proto = CertificatesController.prototype as unknown as Record<string, () => unknown>;

const routes = () =>
  Object.getOwnPropertyNames(proto)
    .filter(
      n => n !== 'constructor' && Reflect.getMetadata(METHOD_METADATA, proto[n]) !== undefined,
    )
    .map(name => ({
      name,
      key: `${HTTP[Reflect.getMetadata(METHOD_METADATA, proto[name])]} ${Reflect.getMetadata(PATH_METADATA, proto[name])}`,
      roles: Reflect.getMetadata(ROLES_KEY, proto[name]) as string[] | undefined,
    }));

describe('CertificatesController — controlo de acesso', () => {
  // Este controller não declara guards na classe: depende dos APP_GUARD globais
  // (JwtAuthGuard + RolesGuard). Um RolesGuard sem @Roles deixa passar qualquer
  // autenticado, por isso toda a rota tem de declarar o seu conjunto de papéis.
  it('toda a rota declara @Roles explicitamente (nada fica fail-open)', () => {
    expect(routes().length).toBeGreaterThan(20);
    expect(
      routes()
        .filter(r => !r.roles || r.roles.length === 0)
        .map(r => r.key),
    ).toEqual([]);
  });

  it('AUDITOR lê mas nunca altera: nenhuma rota de escrita o inclui', () => {
    const writers = routes().filter(r => /^(POST|PUT|DELETE|PATCH)/.test(r.key));
    // Excepções: preview/pdf são só de leitura/renderização; email-me e DELETE my/:id são do próprio titular.
    const readOnlyPosts = ['POST templates/preview', 'POST :id/email-me', 'DELETE my/:id'];
    const offenders = writers
      .filter(r => !readOnlyPosts.includes(r.key) && r.roles!.includes('AUDITOR'))
      .map(r => r.key);
    expect(offenders).toEqual([]);
  });

  it('ciclo de vida (revogar, reemitir, reenviar, importar, lote) é só ADMIN/RH', () => {
    for (const k of [
      'POST :id/revoke',
      'POST :id/reissue',
      'POST :id/resend',
      'POST external',
      'POST issue-batch',
      'POST reconcile-learning-paths',
      'PUT rules',
      'PUT templates/:id',
      'POST assets',
    ]) {
      expect(routes().find(r => r.key === k)?.roles).toEqual(['ADMIN', 'RH']);
    }
  });

  it('emissão manual admite INSTRUCTOR, mas só essa rota', () => {
    const withInstructor = routes().filter(
      r => r.roles!.includes('INSTRUCTOR') && !r.roles!.includes('COLABORADOR'),
    );
    expect(withInstructor.map(r => r.key)).toEqual(['POST issue']);
  });

  it('rotas de uso pessoal usam o conjunto AUTHENTICATED_ROLES completo', () => {
    for (const k of [
      'GET my',
      'GET my/summary',
      'GET my/learning-paths',
      'GET :id/pdf',
      'POST :id/email-me',
    ]) {
      expect(routes().find(r => r.key === k)?.roles).toEqual(AUTHENTICATED_ROLES);
    }
  });

  it('aprovar estende-se a chefias, que ficam limitadas à equipa no handler', () => {
    expect(routes().find(r => r.key === 'POST :id/approve')?.roles).toEqual([
      'ADMIN',
      'RH',
      'GESTOR',
      'LIDER',
      'DIRECTOR',
    ]);
  });

  it('rotas que recebem ficheiros têm limite de uploads por utilizador', () => {
    for (const n of ['uploadAsset', 'importExternal']) {
      expect(Reflect.getMetadata(UPLOAD_THROTTLE_KEY, proto[n])).toBe(true);
    }
  });

  it('rotas fixas são registadas antes de ":id/..." (sem route shadowing)', () => {
    const order = routes().map(r => r.key);
    const firstParam = order.findIndex(k => k.startsWith('POST :id') || k.startsWith('GET :id'));
    for (const fixed of [
      'GET my/summary',
      'GET admin/list',
      'GET team/summary',
      'GET templates/:id',
    ]) {
      expect(order.indexOf(fixed)).toBeLessThan(firstParam);
    }
  });
});

describe('CertificatesController — handlers', () => {
  const user = { id: 5 } as CurrentUserData;
  let s: Record<string, Record<string, jest.Mock>>;
  let controller: CertificatesController;
  const res = () => ({ set: jest.fn(), end: jest.fn() });

  beforeEach(() => {
    s = {
      certificates: { listMine: jest.fn(), getPdfFor: jest.fn() },
      issuance: { issue: jest.fn(), approve: jest.fn() },
      admin: { overview: jest.fn(), list: jest.fn(), history: jest.fn() },
      rules: { upsertRule: jest.fn() },
      lifecycle: { revoke: jest.fn(), reissue: jest.fn(), resend: jest.fn() },
      external: { importExternal: jest.fn() },
      batch: { issueBatch: jest.fn() },
      scope: { resolveScope: jest.fn().mockResolvedValue({ kind: 'TEAM', ids: [1] }) },
      team: { assertCanApprove: jest.fn(), teamSummary: jest.fn() },
      exports: { exportCertificates: jest.fn() },
      me: { mySummary: jest.fn(), emailMe: jest.fn() },
      templateService: { preview: jest.fn(), saveVersion: jest.fn(), restoreVersion: jest.fn() },
      assetService: { upload: jest.fn(), read: jest.fn() },
      learningPaths: { reconcile: jest.fn() },
      pathProgress: { mine: jest.fn() },
    };
    controller = new CertificatesController(
      s.certificates as never,
      s.issuance as never,
      s.admin as never,
      s.rules as never,
      s.lifecycle as never,
      s.external as never,
      s.batch as never,
      s.scope as never,
      s.team as never,
      s.exports as never,
      s.me as never,
      s.templateService as never,
      s.assetService as never,
      s.learningPaths as never,
      s.pathProgress as never,
    );
  });

  describe('âmbito', () => {
    it('overview e list passam o âmbito resolvido para o utilizador (não o filtram no controller)', async () => {
      await controller.overview(user);
      await controller.list({} as never, user);
      expect(s.scope.resolveScope).toHaveBeenCalledTimes(2);
      expect(s.scope.resolveScope).toHaveBeenCalledWith(user);
      expect(s.admin.overview).toHaveBeenCalledWith(expect.any(Date), { kind: 'TEAM', ids: [1] });
      expect(s.admin.list).toHaveBeenCalledWith({}, expect.any(Date), { kind: 'TEAM', ids: [1] });
    });

    it('se o âmbito não puder ser resolvido (sem permissão), não consulta dados', async () => {
      s.scope.resolveScope.mockRejectedValue(new Error('403'));
      await expect(controller.overview(user)).rejects.toThrow('403');
      expect(s.admin.overview).not.toHaveBeenCalled();
    });
  });

  describe('issue', () => {
    it('força actorId e trigger MANUAL, ignorando valores vindos no corpo', async () => {
      s.issuance.issue.mockResolvedValue({
        outcome: 'ISSUED',
        certificate: { id: 1, status: 'ISSUED', validationCode: 'C1', internalNote: 'segredo' },
      });
      const out = await controller.issue(
        { actorId: 999, trigger: 'AUTO', userId: 3 } as never,
        user,
      );
      expect(s.issuance.issue).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 3, actorId: 5, trigger: 'MANUAL' }),
      );
      expect(out).toEqual({
        outcome: 'ISSUED',
        certificate: { id: 1, status: 'ISSUED', validationCode: 'C1' },
      });
    });

    it('sem regra de emissão → 404', async () => {
      s.issuance.issue.mockResolvedValue({ outcome: 'NO_RULE' });
      await expect(controller.issue({} as never, user)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('titular não elegível → 422 com o que falta', async () => {
      s.issuance.issue.mockResolvedValue({ outcome: 'NOT_ELIGIBLE', missing: [] });
      await expect(controller.issue({} as never, user)).rejects.toBeInstanceOf(
        UnprocessableEntityException,
      );
    });

    it('outcome sem certificado não rebenta', async () => {
      s.issuance.issue.mockResolvedValue({ outcome: 'ALREADY_ISSUED' });
      await expect(controller.issue({} as never, user)).resolves.toEqual({
        outcome: 'ALREADY_ISSUED',
        certificate: undefined,
      });
    });
  });

  describe('approve', () => {
    it('valida a equipa ANTES de aprovar', async () => {
      const order: string[] = [];
      s.team.assertCanApprove.mockImplementation(async () => void order.push('assert'));
      s.issuance.approve.mockImplementation(async () => {
        order.push('approve');
        return { id: 9, status: 'ISSUED', internal: 'x' };
      });
      await expect(controller.approve(9, user)).resolves.toEqual({ id: 9, status: 'ISSUED' });
      expect(order).toEqual(['assert', 'approve']);
    });

    it('fora da equipa → nada é aprovado', async () => {
      s.team.assertCanApprove.mockRejectedValue(new NotFoundException());
      await expect(controller.approve(9, user)).rejects.toBeInstanceOf(NotFoundException);
      expect(s.issuance.approve).not.toHaveBeenCalled();
    });
  });

  describe('ciclo de vida — respostas só com campos públicos', () => {
    it('revoke', async () => {
      const revokedAt = new Date();
      s.lifecycle.revoke.mockResolvedValue({
        id: 1,
        status: 'REVOKED',
        revokedAt,
        reason: 'x',
        userId: 9,
      });
      await expect(controller.revoke(1, { reason: 'fraude' } as never, user)).resolves.toEqual({
        id: 1,
        status: 'REVOKED',
        revokedAt,
      });
      expect(s.lifecycle.revoke).toHaveBeenCalledWith(1, 'fraude', 5);
    });

    it('reissue liga original e substituto', async () => {
      s.lifecycle.reissue.mockResolvedValue({
        original: { id: 1, status: 'REVOKED', x: 1 },
        replacement: { id: 2, status: 'ISSUED', validationCode: 'N2', x: 1 },
      });
      await expect(
        controller.reissue(1, { reason: 'erro no nome' } as never, user),
      ).resolves.toEqual({
        original: { id: 1, status: 'REVOKED' },
        replacement: { id: 2, status: 'ISSUED', validationCode: 'N2' },
      });
    });

    it('importExternal', async () => {
      s.external.importExternal.mockResolvedValue({
        outcome: 'CREATED',
        certificate: { id: 3, status: 'ISSUED', validationCode: 'E3', fileKey: 'privado' },
      });
      await expect(controller.importExternal({} as never, user)).resolves.toEqual({
        outcome: 'CREATED',
        certificate: { id: 3, status: 'ISSUED', validationCode: 'E3' },
      });
    });
  });

  describe('reconcileLearningPaths', () => {
    it('é simulação por omissão', async () => {
      await controller.reconcileLearningPaths();
      expect(s.learningPaths.reconcile).toHaveBeenCalledWith(undefined, true);
    });

    it.each(['true', '', '0', 'FALSE', 'no'])('dryRun=%j continua a ser simulação', async v => {
      await controller.reconcileLearningPaths(1, v);
      expect(s.learningPaths.reconcile).toHaveBeenLastCalledWith(1, true);
    });

    it('só a string exacta "false" emite certificados a sério', async () => {
      await controller.reconcileLearningPaths(1, 'false');
      expect(s.learningPaths.reconcile).toHaveBeenCalledWith(1, false);
    });
  });

  describe('respostas binárias', () => {
    it('pdf: autoriza via serviço (dono/RH/ADMIN/AUDITOR) e envia como anexo', async () => {
      const buf = Buffer.from('pdf');
      s.certificates.getPdfFor.mockResolvedValue(buf);
      const r = res();
      await controller.pdf(12, user, r as never);
      expect(s.certificates.getPdfFor).toHaveBeenCalledWith(12, user);
      expect(r.set).toHaveBeenCalledWith({
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="certificado-12.pdf"',
        'Content-Length': 3,
      });
      expect(r.end).toHaveBeenCalledWith(buf);
    });

    it('pdf de certificado alheio: o erro do serviço chega ao cliente e nada é enviado', async () => {
      s.certificates.getPdfFor.mockRejectedValue(new NotFoundException());
      const r = res();
      await expect(controller.pdf(12, user, r as never)).rejects.toBeInstanceOf(NotFoundException);
      expect(r.end).not.toHaveBeenCalled();
    });

    it('preview: PDF inline, nunca em cache', async () => {
      s.templateService.preview.mockResolvedValue(Buffer.from('p'));
      const r = res();
      await controller.previewTemplate({ any: 1 }, r as never);
      expect(r.set).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/pdf',
          'Cache-Control': 'private, no-store',
        }),
      );
    });

    it('asset: nosniff e cache privada', async () => {
      s.assetService.read.mockResolvedValue({ mime: 'image/png', data: Buffer.from('xx') });
      const r = res();
      await controller.asset('a1', r as never);
      expect(r.set).toHaveBeenCalledWith({
        'Content-Type': 'image/png',
        'Content-Length': 2,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      });
    });

    it('export: passa o utilizador ao serviço e usa cabeçalhos de download seguros', async () => {
      s.exports.exportCertificates.mockResolvedValue({
        filename: 'certificados.csv',
        contentType: 'text/csv',
        buffer: Buffer.from('a,b'),
      });
      const r = res();
      await controller.export({} as never, user, r as never);
      expect(s.exports.exportCertificates).toHaveBeenCalledWith({}, user);
      const headers = r.set.mock.calls[0][0];
      expect(headers['Content-Disposition']).toMatch(/^attachment;/);
      expect(headers['Content-Length']).toBe('3');
      expect(headers['Content-Type']).toContain('text/csv');
    });

    it('export com nome de ficheiro malicioso não permite header injection', async () => {
      s.exports.exportCertificates.mockResolvedValue({
        filename: 'a"\r\nSet-Cookie: x=1.csv',
        contentType: 'text/html',
        buffer: Buffer.from('x'),
      });
      const r = res();
      await controller.export({} as never, user, r as never);
      const headers = r.set.mock.calls[0][0];
      expect(headers['Content-Disposition']).not.toMatch(/[\r\n]/);
      expect(headers['Content-Type']).toBe('application/octet-stream');
    });
  });

  it('os recursos pessoais usam sempre o id do utilizador autenticado', async () => {
    await controller.mine(user);
    await controller.mySummary(user);
    await controller.myLearningPaths(user);
    expect(s.certificates.listMine).toHaveBeenCalledWith(5);
    expect(s.me.mySummary).toHaveBeenCalledWith(5);
    expect(s.pathProgress.mine).toHaveBeenCalledWith(5);
  });
});
