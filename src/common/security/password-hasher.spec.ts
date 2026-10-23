import * as bcrypt from 'bcrypt';
import { hashPassword, verifyPassword } from './password-hasher';

describe('password-hasher', () => {
  const OLD = process.env.PASSWORD_PEPPER;
  afterEach(() => {
    if (OLD === undefined) delete process.env.PASSWORD_PEPPER;
    else process.env.PASSWORD_PEPPER = OLD;
  });

  it('gera Argon2id com sal único por hash', async () => {
    const [a, b] = await Promise.all([hashPassword('Segredo123'), hashPassword('Segredo123')]);
    expect(a).toMatch(/^\$argon2id\$v=19\$m=\d+,t=\d+,p=\d+\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('Segredo123');
  });

  it('verifica a senha certa e recusa a errada', async () => {
    const h = await hashPassword('Segredo123');
    expect(await verifyPassword('Segredo123', h)).toEqual({ valid: true, needsRehash: false });
    expect((await verifyPassword('errada', h)).valid).toBe(false);
  });

  it('com pepper, o hash não verifica sem o mesmo pepper', async () => {
    process.env.PASSWORD_PEPPER = 'p'.repeat(40);
    const h = await hashPassword('Segredo123');
    expect((await verifyPassword('Segredo123', h)).valid).toBe(true);
    process.env.PASSWORD_PEPPER = 'q'.repeat(40);
    expect((await verifyPassword('Segredo123', h)).valid).toBe(false);
  });

  it('hash sem pepper continua válido depois de introduzir o pepper e pede re-hash', async () => {
    delete process.env.PASSWORD_PEPPER;
    const h = await hashPassword('Segredo123');
    process.env.PASSWORD_PEPPER = 'p'.repeat(40);
    expect(await verifyPassword('Segredo123', h)).toEqual({ valid: true, needsRehash: true });
  });

  it('aceita bcrypt legado e pede migração para Argon2id', async () => {
    const legacy = await bcrypt.hash('Segredo123', 10);
    expect(await verifyPassword('Segredo123', legacy)).toEqual({ valid: true, needsRehash: true });
    expect((await verifyPassword('errada', legacy)).valid).toBe(false);
  });

  it('recusa formatos desconhecidos (ex.: MD5/texto plano)', async () => {
    expect((await verifyPassword('abc', '900150983cd24fb0d6963f7d28e17f72')).valid).toBe(false);
    expect((await verifyPassword('abc', 'abc')).valid).toBe(false);
  });
});
