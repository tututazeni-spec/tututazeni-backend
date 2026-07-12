import { validate } from 'class-validator';
import { IsStrongPassword } from './strong-password.decorator';

class Dto {
  @IsStrongPassword()
  password!: string;
}

async function errorsFor(pw: string) {
  const d = new Dto();
  d.password = pw;
  return validate(d);
}

describe('IsStrongPassword', () => {
  it('aceita uma senha forte', async () => {
    expect(await errorsFor('SenhaForte123')).toHaveLength(0);
  });
  it('recusa curta (<10)', async () => {
    expect((await errorsFor('Ab1')).length).toBeGreaterThan(0);
  });
  it('recusa sem maiúscula', async () => {
    expect((await errorsFor('senhaforte123')).length).toBeGreaterThan(0);
  });
  it('recusa sem dígito', async () => {
    expect((await errorsFor('SenhaForteAbc')).length).toBeGreaterThan(0);
  });
});
