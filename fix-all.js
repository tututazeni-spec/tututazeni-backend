const fs = require('fs');
const path = require('path');

function readFile(f) { return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; }
function writeFile(f, c) { fs.writeFileSync(f, c, 'utf8'); console.log('✓', path.basename(f)); }
function fix(f, fn) {
  const c = readFile(f); if (!c) return console.log('⚠ not found:', f);
  const n = fn(c); if (n !== c) writeFile(f, n);
}