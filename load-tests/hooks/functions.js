// load-tests/hooks/functions.js
// Funções auxiliares partilhadas por todos os cenários Artillery

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Carrega IDs reais dos CSVs gerados pelo seed ──────────────────────────────

function loadColumn(relPath, fieldName) {
  try {
    const abs     = path.join(__dirname, '..', relPath);
    const lines   = fs.readFileSync(abs, 'utf8').trim().split('\n');
    const headers = lines[0].split(',');
    const idx     = headers.indexOf(fieldName);
    if (idx === -1) throw new Error(`Campo "${fieldName}" não encontrado em ${relPath}`);
    return lines.slice(1).map(l => l.split(',')[idx]).filter(Boolean);
  } catch (err) {
    console.error(`[hooks] Erro ao carregar ${relPath}:`, err.message);
    return [];
  }
}

// Arrays carregados uma vez no arranque — User.id é Int (não UUID)
const courseIds = loadColumn('data/courses.csv', 'courseId');
const lessonIds = loadColumn('data/lessons.csv', 'lessonId');
const userIds   = loadColumn('data/users.csv',   'userId');

if (!courseIds.length) console.error('[hooks] ⚠️  courses.csv vazio — correr seed:loadtest primeiro');
if (!userIds.length)   console.error('[hooks] ⚠️  users.csv vazio — correr seed:loadtest primeiro');

console.log(`[hooks] Carregados: ${courseIds.length} cursos | ${lessonIds.length} lições | ${userIds.length} utilizadores`);

// ── Funções de pick aleatório ─────────────────────────────────────────────────

function pick(arr) {
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Hooks de ciclo de vida ────────────────────────────────────────────────────

/**
 * beforeScenario — chamado antes de cada cenário.
 * Define courseId e lessonId aleatórios no contexto do VU.
 */
function setRandomIds(context, events, done) {
  context.vars.courseId = pick(courseIds);
  context.vars.lessonId = pick(lessonIds) || lessonIds[0];
  return done();
}

/**
 * afterResponse — regista erros 5xx para diagnóstico.
 * 401 e 409 são esperados e ignorados intencionalmente.
 */
function logErrors(requestParams, response, context, events, done) {
  if (response.statusCode >= 500) {
    const body = typeof response.body === 'string'
      ? response.body.substring(0, 300)
      : JSON.stringify(response.body || '').substring(0, 300);
    console.error(
      `[5xx] ${requestParams.method} ${requestParams.url} → ${response.statusCode}: ${body}`
    );
  }
  return done();
}

module.exports = { setRandomIds, logErrors };
