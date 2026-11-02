import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../../src/app.module';
import { PrismaService } from '../../../src/prisma/prisma.service';

export const SCOPE_PREFIX = 'scope.test.';

export interface TestExternal {
  id: number;
  email: string;
  token: string;
}

/** App completa, como em main.ts (cookie-parser + ValidationPipe estrito). */
export async function bootApp(): Promise<INestApplication> {
  const module: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.init();
  return app;
}

/**
 * Cria um instrutor externo ativo e assina-lhe um JWT diretamente: o login real exige o código
 * por e-mail (coberto nos testes de instructor-invites); aqui interessa o ÂMBITO dos módulos.
 */
export async function makeExternal(
  app: INestApplication,
  prisma: PrismaService,
  tag: string,
): Promise<TestExternal> {
  const role = await prisma.role.findUnique({ where: { name: 'INSTRUCTOR_EXTERNO' } });
  if (!role) throw new Error('Perfil INSTRUCTOR_EXTERNO em falta na BD de teste');
  const email = `${SCOPE_PREFIX}${tag}@innova-test.com`;
  const user = await prisma.user.create({
    data: {
      email,
      fullName: `Externo ${tag}`,
      roleId: role.id,
      active: true,
      accountStatus: 'ACTIVE',
      accessExpiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
    select: { id: true },
  });
  const token = await app.get(JwtService, { strict: false }).signAsync({ sub: user.id, email });
  return { id: user.id, email, token };
}

/** Limpeza: filhos antes dos pais (os cursos levam módulos/lições por cascade). */
export async function cleanupScope(prisma: PrismaService, courseTitlePrefix: string): Promise<void> {
  const quiet = async (p: Promise<unknown>): Promise<void> => {
    try {
      await p;
    } catch {
      /* limpeza best-effort */
    }
  };
  const users = await prisma.user.findMany({
    where: { email: { startsWith: SCOPE_PREFIX } },
    select: { id: true },
  });
  const ids = users.map(u => u.id);
  // Matrículas e turmas não têm cascade para o curso: apagar primeiro.
  await quiet(
    prisma.enrollment.deleteMany({ where: { course: { title: { startsWith: courseTitlePrefix } } } }),
  );
  await quiet(
    prisma.course.deleteMany({ where: { title: { startsWith: courseTitlePrefix } } }),
  );
  await quiet(prisma.trainingInstructorProfile.deleteMany({ where: { userId: { in: ids } } }));
  await quiet(
    prisma.userAuditLog.deleteMany({
      where: { OR: [{ userId: { in: ids } }, { performedById: { in: ids } }] },
    }),
  );
  await quiet(prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } }));
  await quiet(prisma.user.deleteMany({ where: { id: { in: ids } } }));
}
