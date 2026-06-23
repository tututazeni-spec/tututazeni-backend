// Reverse-codemod: devolve ao PRIMARY as leituras sensiveis a replication lag
// que o codemod migrate-read-replica.cjs trocou cegamente para a replica.
//
// Alvo: linhas de atribuicao-guarda do tipo
//   const|let <nome> = await this.prismaRead.<model>.<findFirst|findUnique>(...)
// onde <nome> indica verificacao de existencia/unicidade, geracao de sequencia,
// ou read-before-write (read-modify-write). Estas devem ler do primary
// (this.prisma.*) para nao ver dados desactualizados de uma replica atrasada.
//
// So altera a propria linha da atribuicao (o token this.prismaRead. fica no
// inicio do statement); os argumentos da query nas linhas seguintes nao mudam.

const fs = require('fs');

// nomes de variaveis que denunciam um guard pre-escrita / sequencia / RMW
const NAMES = [
  'last', 'seq', 'sequence', 'max', 'lastNumber', 'lastNum',
  'prev', 'current',
  'existing', 'exists', 'exist', 'duplicate', 'conflict', 'already', 'found', 'dup',
];

const lineRe = new RegExp(
  `^(\\s*(?:const|let)\\s+(?:${NAMES.join('|')})\\b[^\\n]*?)this\\.prismaRead\\.([a-zA-Z0-9_]+)\\.(findFirst|findUnique|findFirstOrThrow|findUniqueOrThrow)\\b`,
);

const files = process.argv.slice(2);
let totalReverts = 0;
const report = [];

for (const file of files) {
  const rel = file.replace(/\\/g, '/').replace(/^.*?src\//, 'src/');
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  let reverts = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lineRe.test(lines[i])) {
      lines[i] = lines[i].replace('this.prismaRead.', 'this.prisma.');
      reverts++;
      report.push(`  ${rel}:${i + 1} -> primary`);
    }
  }

  if (reverts > 0) {
    fs.writeFileSync(file, lines.join('\n'), 'utf8');
    totalReverts += reverts;
  }
}

console.log(report.join('\n'));
console.log(`\nTOTAL reverts para primary: ${totalReverts}`);
