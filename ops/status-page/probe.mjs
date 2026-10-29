// Sonda externa da página de estado. Corre no GitHub Actions (fora do VPS), faz GET a cada
// alvo e actualiza status.json com o estado actual e agregados diários (90 dias).
// Uso: STATUS_TARGETS='[{"id":"api","name":"API","url":"https://..."}]' node probe.mjs <ficheiro status.json>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const file = process.argv[2];
if (!file) throw new Error('Uso: node probe.mjs <status.json>');

const targets = JSON.parse(process.env.STATUS_TARGETS || '[]');
if (!Array.isArray(targets) || targets.length === 0) {
  console.log('STATUS_TARGETS vazio — nada a sondar.');
  process.exit(0);
}

const state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { targets: {} };
const now = new Date();
const day = now.toISOString().slice(0, 10);
const TIMEOUT_MS = 10_000;
const KEEP_DAYS = 90;

async function check(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow' });
    return { up: res.status >= 200 && res.status < 400, status: res.status, ms: Date.now() - t0 };
  } catch {
    return { up: false, status: 0, ms: Date.now() - t0 };
  }
}

for (const t of targets) {
  let r = await check(t.url);
  // Uma falha isolada é repetida uma vez antes de contar (evita falsos positivos de rede).
  if (!r.up) r = await check(t.url);

  const prev = state.targets[t.id] ?? { days: {} };
  const d = prev.days[day] ?? { ok: 0, total: 0 };
  d.total += 1;
  if (r.up) d.ok += 1;
  prev.days[day] = d;
  for (const k of Object.keys(prev.days).sort().slice(0, -KEEP_DAYS)) delete prev.days[k];

  state.targets[t.id] = {
    name: t.name,
    up: r.up,
    status: r.status,
    ms: r.ms,
    checkedAt: now.toISOString(),
    days: prev.days,
  };
  console.log(`${t.id}: ${r.up ? 'UP' : 'DOWN'} (${r.status}, ${r.ms} ms)`);
}

state.updatedAt = now.toISOString();
writeFileSync(file, JSON.stringify(state));
