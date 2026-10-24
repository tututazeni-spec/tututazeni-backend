import { readFileSync } from 'fs';
import { join } from 'path';

// O mock de @prisma/client não pode ficar para trás do schema: um enum em falta
// chega como `undefined` e rebenta em import-time (ex.: @IsEnum(undefined)).
describe('prisma-client mock', () => {
  const schema = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');
  const mock = jest.requireActual('./prisma-client.mock.js');

  it('exporta todos os enums do schema.prisma com todos os seus valores', () => {
    const problems: string[] = [];
    for (const m of schema.matchAll(/^enum (\w+) \{([^}]*)\}/gm)) {
      const values = m[2]
        .split('\n')
        .map(l => l.trim().split(/\s/)[0])
        .filter(v => v && !v.startsWith('//') && !v.startsWith('@@'));
      if (!mock[m[1]]) problems.push(`${m[1]} (em falta)`);
      else for (const v of values) if (!(v in mock[m[1]])) problems.push(`${m[1]}.${v}`);
    }
    expect(problems).toEqual([]);
  });

  it('não sobrepõe valores já definidos à mão', () => {
    expect(mock.CertificateType.COURSE).toBe('COURSE');
  });
});
