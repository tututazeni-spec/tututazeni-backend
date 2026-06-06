const data = require('./coverage/coverage-summary.json');
const files = Object.entries(data)
  .filter(([k]) => k !== 'total')
  .map(([k, v]) => {
    const parts = k.replace(/\\/g, '/').split('src/');
    const file = parts.length > 1 ? parts.pop() : k;
    return { file, pct: v.lines.pct, covered: v.lines.covered, total: v.lines.total };
  })
  .filter(f => f.total > 0 && f.pct < 50)
  .sort((a, b) => a.pct - b.pct);

console.log('Files below 50% coverage (' + files.length + ' files):');
files.slice(0, 50).forEach(f =>
  console.log(String(Math.round(f.pct)).padStart(4) + '%  ' + f.covered + '/' + f.total + '  ' + f.file)
);

const total = data.total;
console.log('\nTOTAL:');
console.log('  Lines:      ' + total.lines.pct + '%  (' + total.lines.covered + '/' + total.lines.total + ')');
console.log('  Statements: ' + total.statements.pct + '%  (' + total.statements.covered + '/' + total.statements.total + ')');
console.log('  Functions:  ' + total.functions.pct + '%  (' + total.functions.covered + '/' + total.functions.total + ')');
console.log('  Branches:   ' + total.branches.pct + '%  (' + total.branches.covered + '/' + total.branches.total + ')');
