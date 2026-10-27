// load-tests/scripts/prepare-data.js
// Prepara os dados do teste de carga a partir do estado REAL da API:
//   1. courses.csv  — IDs de cursos PUBLISHED que existem agora (o seed pode ter sido re-executado
//                     e deixado IDs antigos no CSV -> 404 em todo o fluxo de inscrição)
//   2. tokens.csv   — pool de access tokens (JWT 15 min), para que os vusers não façam login
//                     em cada sessão: o Argon2 (~100-200 ms de CPU) passaria a ser o que se mede
// Uso: node load-tests/scripts/prepare-data.js   (correr imediatamente antes de test:load)

'use strict';

const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE || 'http://127.0.0.1:4000';
const PASSWORD = process.env.LOADTEST_PASSWORD || 'LoadTest@2024';
const LOGIN_CONCURRENCY = Number(process.env.LOGIN_CONCURRENCY || 3);
const DATA = path.join(__dirname, '..', 'data');

const post = (url, body) =>
  fetch(BASE + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

async function login(email) {
  const r = await post('/auth/login', { email, password: PASSWORD });
  if (!r.ok) throw new Error(`login ${email} -> ${r.status}`);
  return (await r.json()).accessToken;
}

async function syncCourses(adminToken) {
  const rows = [];
  for (let page = 1; page <= 50; page++) {
    const r = await fetch(`${BASE}/courses?page=${page}&limit=20`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const j = await r.json();
    const items = j.data || [];
    rows.push(...items);
    if (items.length < 20 || (j.meta?.totalPages && page >= j.meta.totalPages)) break;
  }
  const seen = new Map(rows.filter(c => c.status === 'PUBLISHED').map(c => [c.id, c.title]));
  const lines = ['courseId,title', ...[...seen].map(([id, title]) => `${id},${String(title).replace(/,/g, ' ')}`)];
  fs.writeFileSync(path.join(DATA, 'courses.csv'), lines.join('\n'));
  return seen.size;
}

async function buildTokens(emails) {
  const out = ['email,token'];
  let next = 0;
  async function worker() {
    while (next < emails.length) {
      const email = emails[next++];
      try {
        out.push(`${email},${await login(email)}`);
      } catch (e) {
        console.error('[tokens]', e.message);
      }
    }
  }
  await Promise.all(Array.from({ length: LOGIN_CONCURRENCY }, worker));
  fs.writeFileSync(path.join(DATA, 'tokens.csv'), out.join('\n'));
  return out.length - 1;
}

(async () => {
  const emails = fs
    .readFileSync(path.join(DATA, 'users.csv'), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map(l => l.split(',')[0]);

  const adminToken = await login(emails[0]);
  console.log(`[prepare] cursos PUBLISHED: ${await syncCourses(adminToken)}`);
  console.log(`[prepare] tokens gerados: ${await buildTokens(emails)}/${emails.length}`);
})().catch(e => {
  console.error('[prepare] falhou:', e.message);
  process.exit(1);
});
