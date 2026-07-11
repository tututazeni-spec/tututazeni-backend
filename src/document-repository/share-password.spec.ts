import { hashSharePassword, verifySharePassword } from './share-password';

describe('share link password hashing', () => {
  it('produz um hash bcrypt (não sha256 hex de 64 chars)', async () => {
    const hash = await hashSharePassword('segredo');
    expect(hash).toMatch(/^\$2[aby]\$/); // prefixo bcrypt
    expect(hash).not.toMatch(/^[a-f0-9]{64}$/); // não é sha256
  });

  it('verifica correctamente a senha certa e recusa a errada', async () => {
    const hash = await hashSharePassword('segredo');
    expect(await verifySharePassword('segredo', hash)).toBe(true);
    expect(await verifySharePassword('errada', hash)).toBe(false);
  });
});
