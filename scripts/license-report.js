#!/usr/bin/env node
// Inventário das licenças das dependências de PRODUÇÃO (directas e transitivas) instaladas.
// Uso: node scripts/license-report.js [pasta-do-projecto ...]   (omissão: raiz e frontend/)
// Lê package.json + node_modules, sem rede nem dependências. Sai com código 1 se encontrar
// licenças copyleft forte (GPL/AGPL/SSPL) ou sem licença identificável, para poder correr em CI.
//
// Isto NÃO é parecer jurídico: serve para o advogado/responsável de PI rever o que é redistribuído.

const fs = require('fs');
const path = require('path');

const STRONG_COPYLEFT = /(^|[^L])GPL|AGPL|SSPL|EUPL|OSL|CPAL/i; // GPL/AGPL (LGPL fica no aviso fraco)
const WEAK_COPYLEFT = /LGPL|MPL|EPL|CDDL|CC-BY-SA/i;
const SOURCE_AVAILABLE = /FSL|BUSL|BSL-|SSPL|Elastic|Commons-Clause/i; // não são open source OSI: ler os termos

// Licenças confirmadas à mão (pacote sem campo "license" mas com ficheiro de licença verificado).
const VERIFIED = {
  'png-js': 'MIT (ficheiro LICENSE do pacote)',
};

// Expressão SPDX com alternativa permissiva (ex.: "MIT OR GPL-3.0-or-later"): o titular escolhe a permissiva.
function hasPermissiveChoice(expr) {
  if (!/\sOR\s/i.test(expr)) return false;
  return expr
    .replace(/[()]/g, '')
    .split(/\sOR\s/i)
    .some((alt) => /^(MIT|ISC|BSD|Apache|0BSD|CC0|Unlicense|BlueOak|Zlib)/i.test(alt.trim()));
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function licenseOf(pkg) {
  if (!pkg) return 'DESCONHECIDA';
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type || l).join(' OR ');
  return 'DESCONHECIDA';
}

// Percorre só o que é alcançável a partir das dependências de produção.
function collect(projectDir) {
  const root = readJson(path.join(projectDir, 'package.json'));
  if (!root) throw new Error(`Sem package.json em ${projectDir}`);
  const seen = new Map();
  const queue = Object.keys(root.dependencies || {}).map((n) => ({ name: n, from: projectDir }));

  function resolve(name, from) {
    let dir = from;
    for (;;) {
      const candidate = path.join(dir, 'node_modules', name, 'package.json');
      if (fs.existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  }

  while (queue.length) {
    const { name, from } = queue.pop();
    const file = resolve(name, from);
    if (!file) continue;
    const pkg = readJson(file);
    if (!pkg) continue;
    const key = `${pkg.name}@${pkg.version}`;
    if (seen.has(key)) continue;
    const license = VERIFIED[pkg.name] && licenseOf(pkg) === 'DESCONHECIDA' ? VERIFIED[pkg.name] : licenseOf(pkg);
    seen.set(key, { name: pkg.name, version: pkg.version, license });
    const dir = path.dirname(file);
    for (const dep of Object.keys(pkg.dependencies || {})) queue.push({ name: dep, from: dir });
    for (const dep of Object.keys(pkg.optionalDependencies || {})) queue.push({ name: dep, from: dir });
  }
  return { name: root.name, packages: [...seen.values()] };
}

function summarize({ name, packages }) {
  const byLicense = {};
  const strong = [];
  const sourceAvailable = [];
  const weak = [];
  const unknown = [];
  for (const p of packages) {
    byLicense[p.license] = (byLicense[p.license] || 0) + 1;
    if (p.license === 'DESCONHECIDA' || /UNLICENSED|SEE LICENSE/i.test(p.license)) unknown.push(p);
    else if (SOURCE_AVAILABLE.test(p.license)) sourceAvailable.push(p);
    else if (STRONG_COPYLEFT.test(p.license) && !hasPermissiveChoice(p.license)) strong.push(p);
    else if (WEAK_COPYLEFT.test(p.license)) weak.push(p);
  }
  return { name, total: packages.length, byLicense, strong, sourceAvailable, weak, unknown };
}

function render(s) {
  const lines = [`### ${s.name} — ${s.total} pacotes de produção`, '', '| Licença | Pacotes |', '|---|---|'];
  Object.entries(s.byLicense)
    .sort((a, b) => b[1] - a[1])
    .forEach(([l, n]) => lines.push(`| ${l} | ${n} |`));
  const list = (title, arr) => {
    if (!arr.length) return;
    lines.push('', `**${title}**`, '');
    arr.sort((a, b) => a.name.localeCompare(b.name)).forEach((p) => lines.push(`- ${p.name}@${p.version} — ${p.license}`));
  };
  list('Copyleft forte (rever com o advogado antes de redistribuir)', s.strong);
  list('Licença "source-available" (não é open source: ler os termos)', s.sourceAvailable);
  list('Copyleft fraco (obrigações apenas sobre alterações ao próprio pacote)', s.weak);
  list('Sem licença identificável (verificar manualmente)', s.unknown);
  lines.push('');
  return lines.join('\n');
}

const dirs = process.argv.slice(2);
const targets = dirs.length ? dirs : ['.', 'frontend'];
const summaries = targets.map((d) => summarize(collect(path.resolve(d))));
process.stdout.write(summaries.map(render).join('\n'));
if (summaries.some((s) => s.strong.length || s.sourceAvailable.length || s.unknown.length)) process.exitCode = 1;
