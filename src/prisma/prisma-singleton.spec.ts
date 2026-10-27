import * as fs from 'fs';
import * as path from 'path';

/**
 * Cada PrismaService abre o seu próprio pool (DB_POOL_MAX ligações), aquece-o e regista listeners.
 * Declará-lo em `providers` de outro módulo cria uma 2ª instância completa no mesmo processo — foi o
 * que o MobileModule fazia, duplicando as ligações ao Postgres de cada instância da app.
 * Só o PrismaModule (@Global) o pode fornecer.
 */
function moduleFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return moduleFiles(p);
    return e.name.endsWith('.module.ts') ? [p] : [];
  });
}

describe('PrismaService é singleton', () => {
  const root = path.join(__dirname, '..');

  it('nenhum módulo além de PrismaModule o declara em providers', () => {
    const offenders = moduleFiles(root)
      .filter(f => path.basename(f) !== 'prisma.module.ts')
      .filter(f => {
        const src = fs.readFileSync(f, 'utf8');
        const providers = [
          ...src.matchAll(
            /providers:\s*\[([\s\S]*?)\]\s*,?\s*(?:exports|imports|controllers|\}\))/g,
          ),
        ];
        return providers.some(m => /\bPrismaService\b/.test(m[1]));
      })
      .map(f => path.relative(root, f));
    expect(offenders).toEqual([]);
  });

  it('PrismaModule é global e exporta o serviço', () => {
    const src = fs.readFileSync(path.join(root, 'prisma', 'prisma.module.ts'), 'utf8');
    expect(src).toMatch(/@Global\(\)/);
    expect(src).toMatch(/exports:\s*\[PrismaService\]/);
  });
});
