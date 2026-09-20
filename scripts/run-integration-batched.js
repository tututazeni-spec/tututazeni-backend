// Runs test/integration in batches, each a fresh `jest` process (own OS process,
// own V8 heap). The full suite has grown too large to run as a single process —
// even with --runInBand and workerIdleMemoryLimit, the accumulated memory across
// ~65+ full Nest-app bootstraps still exhausts the default heap. Batches run
// sequentially (not in parallel) to preserve the shared-DB safety that the rest
// of the integration suite relies on (specs are not isolated from each other
// within a run).
const { spawnSync } = require('child_process');
const path = require('path');

const jestBin = path.join(__dirname, '..', 'node_modules', 'jest', 'bin', 'jest.js');

const BATCHES = [
  // Batches 1 e 2 originais (9 módulos cada) eram os últimos que ainda não
  // tinham sido partidos — o 1 passou a esgotar a heap de 4 GB (OOM
  // "Ineffective mark-compacts near heap limit" a meio do batch). Mesmo
  // split preventivo aplicado ao 2, que tinha exactamente o mesmo tamanho.
  // O split para 5 módulos ainda voltou a esgotar a heap em CI (app.module.ts
  // continua a crescer a cada feature integrada) — partido de novo, agora a
  // 2-3 módulos por processo.
  // 'academic' foi removido (módulo eliminado) — já não tem specs; o grupo
  // ficou de facto só com acl + ai-tutor.
  ['acl', 'ai-tutor'],
  ['analytics', 'api-integration'],
  ['assessments', 'attendance', 'audit', 'auth'],
  ['automation', 'avatar-training', 'career', 'career-plans', 'certificates'],
  ['certification', 'competencies', 'competency-map', 'content-library'],
  // Batch 3 original (9 módulos) também passou a esgotar a heap de 4 GB — o
  // bootstrap Nest de cada spec ficou mais pesado à medida que app.module.ts
  // acumulou módulos de outras features entretanto integradas. Mesmo split
  // usado acima nos batches 7 e 9.
  ['course-modules', 'courses', 'crm-beneficiaries', 'crm-funders', 'crm-partners'],
  ['dashboard', 'dashboard-institutional', 'dashboard-rh', 'declarations'],
  // Split preventivo (mesmo motivo dos batches 3/7/9): 9 módulos por processo
  // já não cabe folgadamente na heap de 4 GB com o app.module.ts actual.
  ['departments', 'document-repository', 'employees', 'engagement', 'enrollment'],
  ['evaluation', 'evaluation360', 'events', 'executive-reports'],
  // `leadership` isolado: o workspace corporativo (plano 2026-09-09) trouxe 6
  // specs que arrancam cada uma a sua app Nest completa; juntas com o resto do
  // antigo batch 5 no mesmo processo jest esgotavam a heap ("exit null").
  ['instructor', 'knowledge', 'leader', 'leadership'],
  ['learning-paths', 'leave-management', 'library', 'live-classes', 'lms'],
  // Batch 7 original (10 módulos) começou a esgotar a heap de 4 GB à medida
  // que os módulos cresceram — dividido em dois, mesmo padrão do isolamento
  // do `leadership` acima.
  ['metrics', 'micro-learning', 'mobile', 'monitoring', 'notifications'],
  ['onboarding', 'organization', 'payslips', 'payroll', 'pdf'],
  // Split preventivo — mesmo motivo do batch acima.
  ['pdi', 'performance', 'process-standard', 'reports', 'roi-impact'],
  ['roles-permissions', 'scalability', 'search', 'succession'],
  // Batch 9 original (8 módulos) — mesmo motivo do split acima.
  ['talent-development', 'trainings', 'users', 'work-declaration'],
  ['enrollments', 'development-plans', 'history', 'health'],
];

let failed = false;

for (const [i, modules] of BATCHES.entries()) {
  const pattern = `test/integration/(${modules.join('|')})/`;
  console.log(`\n=== Batch ${i + 1}/${BATCHES.length}: ${modules.join(', ')} ===\n`);

  const result = spawnSync(
    process.execPath,
    [
      jestBin,
      '--config',
      'test/jest-integration.json',
      '--forceExit',
      '--runInBand',
      '--testPathPatterns',
      pattern,
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        // Cada spec arranca a sua própria app Nest; num batch grande a heap
        // por omissão (~2 GB) não chega e o processo morre com "exit null".
        // 4096 voltou a esgotar (PR #311) mesmo no batch 1, que já só tem
        // 2 módulos reais (acl + ai-tutor — 'academic' foi removido e o
        // pattern já não corresponde a nada) — o bootstrap de uma única app
        // Nest completa (AppModule já com dezenas de módulos) por si só
        // aproxima-se do tecto de 4 GB. O runner ubuntu-latest tem 16 GB —
        // subir para 8192 dá folga sem se aproximar do limite da máquina.
        NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=8192`.trim(),
      },
    },
  );

  if (result.status !== 0) {
    failed = true;
    console.error(`\n=== Batch ${i + 1} FAILED (exit ${result.status}) ===\n`);
  }
}

process.exit(failed ? 1 : 0);
