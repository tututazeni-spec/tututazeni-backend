// Codemod: migra leituras read-heavy para a réplica (this.prismaRead).
// - Insere o getter prismaRead antes do constructor.
// - Troca this.prisma.<model>.<readOp>( -> this.prismaRead.<model>.<readOp>(
//   para readOps puras de leitura.
// NÃO processa ficheiros com $transaction([...]) (tratados à mão) nem
// callbacks interativos tx.* (que usam outra variável).

const fs = require('fs');
const path = require('path');

const READ_OPS = [
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'count',
  'aggregate',
  'groupBy',
];

const GETTER = `  /**
   * Cliente de leitura: usa a réplica (this.prisma.db) quando disponível,
   * caindo para o primary quando .db não existe (ex.: mocks de teste).
   */
  private get prismaRead(): any {
    return (this.prisma as any).db ?? this.prisma;
  }

`;

const readRegex = new RegExp(
  `this\\.prisma\\.([a-zA-Z0-9_]+)\\.(${READ_OPS.join('|')})\\b`,
  'g',
);

// Ficheiros com $transaction array — excluídos, tratados manualmente.
const TX_FILES = new Set([
  'academic/academic.service.ts',
  'library/library.service.ts',
  'lms/lms.service.ts',
  'monitoring/monitoring.service.ts',
]);

const files = process.argv.slice(2);
let totalSwaps = 0;
const report = [];

for (const file of files) {
  const rel = file.replace(/\\/g, '/').replace(/^.*?src\//, '');
  void TX_FILES;
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('get prismaRead')) {
    report.push(`SKIP (já migrado): ${rel}`);
    continue;
  }

  // 1) Inserir getter antes do primeiro constructor(
  const ctorIdx = src.search(/^\s*constructor\s*\(/m);
  if (ctorIdx === -1) {
    report.push(`WARN (sem constructor): ${rel}`);
    continue;
  }
  // recuar até ao início da linha do constructor
  const lineStart = src.lastIndexOf('\n', ctorIdx) + 1;
  src = src.slice(0, lineStart) + GETTER + src.slice(lineStart);

  // 2) Trocar leituras
  let swaps = 0;
  src = src.replace(readRegex, (m, model, op) => {
    swaps++;
    return `this.prismaRead.${model}.${op}`;
  });

  fs.writeFileSync(file, src, 'utf8');
  totalSwaps += swaps;
  report.push(`OK ${rel} — ${swaps} leituras`);
}

console.log(report.join('\n'));
console.log(`\nTOTAL swaps: ${totalSwaps} em ${files.length} ficheiros candidatos`);
