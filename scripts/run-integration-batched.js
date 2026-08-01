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
  ['academic', 'acl', 'ai-tutor', 'analytics', 'api-integration', 'assessments', 'attendance', 'audit', 'auth'],
  ['automation', 'avatar-training', 'career', 'career-plans', 'certificates', 'certification', 'competencies', 'competency-map', 'content-library'],
  ['course-modules', 'courses', 'crm-beneficiaries', 'crm-funders', 'crm-partners', 'dashboard', 'dashboard-institutional', 'dashboard-rh', 'declarations'],
  ['departments', 'document-repository', 'employees', 'engagement', 'enrollment', 'evaluation', 'evaluation360', 'events', 'executive-reports'],
  ['instructor', 'knowledge', 'leader', 'leadership', 'learning-paths', 'leave-management', 'library', 'live-classes', 'lms'],
  ['metrics', 'micro-learning', 'mobile', 'monitoring', 'notifications', 'onboarding', 'organization', 'payslips', 'pdf'],
  ['pdi', 'performance', 'process-standard', 'reports', 'roi-impact', 'roles-permissions', 'scalability', 'search', 'succession'],
  [
    'talent-development',
    'trainings',
    'users',
    'work-declaration',
    'enrollments',
    'development-plans',
    'history',
    'health',
  ],
];

let failed = false;

for (const [i, modules] of BATCHES.entries()) {
  const pattern = `test/integration/(${modules.join('|')})/`;
  console.log(`\n=== Batch ${i + 1}/${BATCHES.length}: ${modules.join(', ')} ===\n`);

  const result = spawnSync(
    process.execPath,
    [jestBin, '--config', 'test/jest-integration.json', '--forceExit', '--runInBand', '--testPathPatterns', pattern],
    {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'test' },
    },
  );

  if (result.status !== 0) {
    failed = true;
    console.error(`\n=== Batch ${i + 1} FAILED (exit ${result.status}) ===\n`);
  }
}

process.exit(failed ? 1 : 0);
