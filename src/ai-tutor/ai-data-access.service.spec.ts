import { Controller, Get, RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AiDataAccessService } from './ai-data-access.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';

@Controller('courses')
class CoursesCtrl {
  @Get('my') my() {}
  @Get(':id') one() {}
  @Public() @Get('open') open() {}
}
@Controller('payroll')
@Roles('ADMIN', 'RH')
class PayrollCtrl {
  @Get('runs') runs() {}
}
@Controller('auth')
class AuthCtrl {
  @Get('me') me() {}
}

const modules = new Map([
  [
    'm',
    {
      controllers: new Map([
        ['a', { metatype: CoursesCtrl }],
        ['b', { metatype: PayrollCtrl }],
        ['c', { metatype: AuthCtrl }],
      ]),
    },
  ],
]);

describe('AiDataAccessService', () => {
  const chat = jest.fn();
  const svc = new AiDataAccessService(modules as any, new Reflector(), { chat } as any);
  const emp = { id: 1, role: { name: 'COLABORADOR' } };
  const hr = { id: 2, role: { name: 'RH' } };
  let fetchMock: jest.Mock;

  beforeEach(() => {
    chat.mockReset();
    fetchMock = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => '{"a":1,"password":"x","n":[1]}',
      });
    (global as any).fetch = fetchMock;
  });

  it('catálogo respeita @Roles, @Public e prefixos negados', async () => {
    chat.mockResolvedValue({ text: '{"calls":[]}' });
    await svc.gatherContext(emp, { token: 't' }, 'olá');
    const catalogEmp = chat.mock.calls[0][0] as string;
    expect(catalogEmp).toContain('/courses/my');
    expect(catalogEmp).not.toContain('/payroll/runs');
    expect(catalogEmp).not.toContain('/auth/me');
    expect(catalogEmp).not.toContain('/courses/open');
    chat.mockClear();
    await svc.gatherContext(hr, { token: 't' }, 'olá');
    expect(chat.mock.calls[0][0]).toContain('/payroll/runs');
  });

  it('rejeita rotas fora do catálogo do role (não chama a API)', async () => {
    chat.mockResolvedValue({
      text: '{"calls":["/payroll/runs","/auth/me","//evil.com","/courses/../payroll/runs"]}',
    });
    const out = await svc.gatherContext(emp, { token: 't' }, 'salários?');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toBe('');
  });

  it('chama com o token do utilizador, higieniza e devolve bloco', async () => {
    chat
      .mockResolvedValueOnce({ text: '{"calls":["/courses/my","/courses/12"]}' })
      .mockResolvedValue({ text: '{"calls":[]}' });
    const out = await svc.gatherContext(emp, { token: 'jwt' }, 'os meus cursos');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].headers.Cookie).toBe('token=jwt');
    expect(out).toContain('GET /courses/my');
    expect(out).not.toContain('password');
  });

  it('403 da API vira aviso de falta de permissão', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, text: async () => '' });
    chat
      .mockResolvedValueOnce({ text: '{"calls":["/courses/my"]}' })
      .mockResolvedValue({ text: '{"calls":[]}' });
    const out = await svc.gatherContext(emp, { token: 'jwt' }, 'x');
    expect(out).toContain('SEM PERMISSÃO');
  });

  it('sem token ou desactivado não faz nada', async () => {
    expect(await svc.gatherContext(emp, {}, 'x')).toBe('');
    process.env.AI_TUTOR_DATA_ACCESS = 'false';
    expect(await svc.gatherContext(emp, { token: 't' }, 'x')).toBe('');
    delete process.env.AI_TUTOR_DATA_ACCESS;
    expect(chat).not.toHaveBeenCalled();
  });
});
