// prisma/seed-load-test.ts
// Seed dedicado a dados de teste de carga — NÃO usar em produção

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' }); // carrega .env explicitamente (ts-node não o faz)

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

const TOTAL_USERS = 200;
const TOTAL_COURSES = 50;
const TEST_PASSWORD = 'LoadTest@2024';

async function main() {
  console.log('🌱 A iniciar seed de dados de teste de carga...\n');

  // rounds=4 para testes de carga — compare usa os rounds da hash armazenada
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);

  // ── 1. Roles ─────────────────────────────────────────────────────────────
  // Valores reais confirmados nos controllers: COLABORADOR, GESTOR, RH, ADMIN
  const roleNames = ['COLABORADOR', 'GESTOR', 'RH', 'ADMIN'];
  const roleMap: Record<string, { id: number }> = {};

  for (const name of roleNames) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, description: `Role ${name}` },
    });
    roleMap[name] = role;
  }
  console.log('✅ Roles verificadas:', roleNames.join(', '));

  // ── 2. Departamento ───────────────────────────────────────────────────────
  // Department.code é o campo @unique — não name
  const department = await prisma.department.upsert({
    where: { code: 'DEPT-LOAD-TEST' },
    update: {},
    create: { code: 'DEPT-LOAD-TEST', name: 'Departamento de Testes de Carga' },
  });
  console.log('✅ Departamento verificado:', department.name);

  // ── 3. Utilizadores de teste ──────────────────────────────────────────────
  // User.id é Int | User.active (não isActive) | fullName (não name)
  const userIds: number[] = [];
  const usersCsv: string[] = ['email,password,role,userId'];

  console.log(`\n⏳ A criar ${TOTAL_USERS} utilizadores...`);
  for (let i = 1; i <= TOTAL_USERS; i++) {
    const roleName = i <= 10 ? 'ADMIN' : i <= 30 ? 'RH' : i <= 50 ? 'GESTOR' : 'COLABORADOR';

    const email = `load.test.user${i}@innova-test.com`;

    const user = await prisma.user.upsert({
      where: { email },
      update: { password: passwordHash }, // actualiza hash para rounds=4
      create: {
        email,
        fullName: `Utilizador Teste ${i}`,
        password: passwordHash,
        roleId: roleMap[roleName].id,
        departmentId: department.id,
        active: true,
        accountStatus: 'ACTIVE',
      },
    });

    userIds.push(user.id);
    usersCsv.push(`${email},${TEST_PASSWORD},${roleName},${user.id}`);

    if (i % 50 === 0) console.log(`  → ${i}/${TOTAL_USERS} utilizadores criados`);
  }

  const dataDir = path.join(__dirname, '../load-tests/data');
  fs.mkdirSync(dataDir, { recursive: true });

  fs.writeFileSync(path.join(dataDir, 'users.csv'), usersCsv.join('\n'));
  console.log(`✅ ${TOTAL_USERS} utilizadores criados → users.csv`);

  // ── 4. Cursos (PUBLISHED) com módulos e lições ────────────────────────────
  // Course.internalCode é o campo @unique (não title)
  // Lesson pertence a CourseModule (moduleId), não directamente ao Course
  // Lesson.textContent é o campo correcto (não content)
  const courseIds: number[] = [];
  const coursesCsv: string[] = ['courseId,title'];
  const lessonsCsv: string[] = ['lessonId,courseId,moduleId'];

  console.log(`\n⏳ A criar ${TOTAL_COURSES} cursos...`);
  for (let i = 1; i <= TOTAL_COURSES; i++) {
    const internalCode = `LOAD-TEST-${String(i).padStart(3, '0')}`;

    // upsert via internalCode (único) — title não tem @@unique
    let course = await prisma.course.findUnique({ where: { internalCode } });
    if (!course) {
      course = await prisma.course.create({
        data: {
          title: `Curso de Teste ${i}`,
          internalCode,
          description: `Curso de carga número ${i} — não usar em produção`,
          status: 'PUBLISHED',
          departmentId: department.id,
          publishedAt: new Date(),
        },
      });
    }

    courseIds.push(course.id);
    coursesCsv.push(`${course.id},Curso de Teste ${i}`);

    // 1 módulo por curso
    let courseModule = await prisma.courseModule.findFirst({
      where: { courseId: course.id },
    });
    if (!courseModule) {
      courseModule = await prisma.courseModule.create({
        data: { courseId: course.id, title: `Módulo 1`, seq: 1 },
      });
    }

    // 3 lições nos primeiros 10 cursos (para testes de progresso)
    if (i <= 10) {
      for (let l = 1; l <= 3; l++) {
        let lesson = await prisma.lesson.findFirst({
          where: { moduleId: courseModule.id, seq: l },
        });
        if (!lesson) {
          lesson = await prisma.lesson.create({
            data: {
              moduleId: courseModule.id,
              title: `Lição ${l}`,
              textContent: `Conteúdo de teste da lição ${l} — curso ${i}`,
              seq: l,
            },
          });
        }
        lessonsCsv.push(`${lesson.id},${course.id},${courseModule.id}`);
      }
    }
  }

  fs.writeFileSync(path.join(dataDir, 'courses.csv'), coursesCsv.join('\n'));
  fs.writeFileSync(path.join(dataDir, 'lessons.csv'), lessonsCsv.join('\n'));
  console.log(`✅ ${TOTAL_COURSES} cursos criados → courses.csv`);
  console.log('✅ Lições criadas → lessons.csv');

  // ── 5. Inscrições pré-existentes (para GET /enrollments/my ter dados) ─────
  // Enrollment.@@unique([courseId, userId]) — compound key courseId_userId
  // Utilizadores 1-50 inscritos nos cursos 1-5
  console.log('\n⏳ A criar inscrições pré-existentes...');
  let enrollCount = 0;
  for (const userId of userIds.slice(0, 50)) {
    for (const courseId of courseIds.slice(0, 5)) {
      await prisma.enrollment.upsert({
        where: { courseId_userId: { courseId, userId } },
        update: {},
        create: {
          courseId,
          userId,
          status: 'NOT_STARTED',
          origin: 'MANUAL',
        },
      });
      enrollCount++;
    }
  }
  console.log(`✅ ${enrollCount} inscrições pré-criadas`);

  // ── 6. CSV de pares para testes de escrita de inscrição ───────────────────
  // Utilizadores 51-150 × Cursos 11-20 — sem inscrição prévia (evita 409 no seed)
  // Durante o load test, 409 é esperado (@@unique) mas não no seed
  const enrollPairsCsv: string[] = ['userId,courseId'];
  for (const userId of userIds.slice(50, 150)) {
    for (const courseId of courseIds.slice(10, 20)) {
      enrollPairsCsv.push(`${userId},${courseId}`);
    }
  }
  fs.writeFileSync(path.join(dataDir, 'enrollment-pairs.csv'), enrollPairsCsv.join('\n'));
  console.log('✅ Pares para testes de inscrição criados → enrollment-pairs.csv');

  // ── Resumo ────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 Seed de testes de carga concluído!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Utilizadores : ${TOTAL_USERS}`);
  console.log(`  Cursos       : ${TOTAL_COURSES} (PUBLISHED)`);
  console.log(`  Lições       : 30 (3 por curso × 10 cursos)`);
  console.log(`  Inscrições   : ${enrollCount} pré-existentes`);
  console.log(`  Pares CSV    : ${enrollPairsCsv.length - 1} (para testes de escrita)`);
  console.log('  📁 CSVs em: load-tests/data/');
  console.log('\n  ⚠️  JWT expira em 15 min (hardcoded no auth.service.ts)');
  console.log('     Para testes > 15 min, ajustar expiresIn antes de correr.\n');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
