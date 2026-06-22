// Para specs que usam `new Proxy(mockPrisma, { get(target, prop) {...} })`,
// adiciona `if (prop === 'db') return <proxyVar>;` para que o getter
// prismaRead do serviço (this.prisma.db ?? this.prisma) resolva no próprio
// mock em vez de num fallbackModel.

const fs = require('fs');

const files = process.argv.slice(2);
const report = [];

for (const file of files) {
  const rel = file.replace(/\\/g, '/').replace(/^.*?src\//, 'src/');
  let src = fs.readFileSync(file, 'utf8');

  if (!src.includes('new Proxy')) {
    report.push(`SKIP (sem Proxy): ${rel}`);
    continue;
  }
  if (src.includes("prop === 'db'")) {
    report.push(`SKIP (já tem db): ${rel}`);
    continue;
  }

  // capturar nome do proxy: const NAME(: any)? = new Proxy(
  const m = src.match(/const\s+(\w+)(\s*:\s*[^=]+)?\s*=\s*new Proxy\(/);
  if (!m) {
    report.push(`WARN (não achei const = new Proxy): ${rel}`);
    continue;
  }
  const name = m[1];

  // garantir tipagem any no const (evita "used before assignment"/tipos)
  if (!m[2]) {
    src = src.replace(
      new RegExp(`const\\s+${name}\\s*=\\s*new Proxy\\(`),
      `const ${name}: any = new Proxy(`,
    );
  }

  // inserir a clausula logo após o `get(target, prop) {`
  const getRe = /get\s*\(\s*target\s*,\s*prop\s*\)\s*\{/;
  if (!getRe.test(src)) {
    report.push(`WARN (handler get(target, prop) não encontrado): ${rel}`);
    continue;
  }
  src = src.replace(
    getRe,
    match => `${match}\n      if (prop === 'db') return ${name};`,
  );

  fs.writeFileSync(file, src, 'utf8');
  report.push(`OK ${rel} (proxy=${name})`);
}

console.log(report.join('\n'));
