import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { Request, Response } from 'express';
import { AppModule } from './app.module';
import { enforceHttpsMiddleware } from './common/security/enforce-https';
import { parseAllowedOrigins } from './common/security/allowed-origins';
import { createSwaggerAuthMiddleware } from './common/security/swagger-auth.middleware';
import { csrfHeaderMiddleware } from './common/security/csrf-header-guard';
import { TOKEN_COOKIE } from './auth/token-cookie';
import { validateEnv } from './common/bootstrap/validate-env';
import { runWithRequestContext } from './common/logging/request-context';

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Rede de segurança ao nível do processo — sem isto, uma promise não apanhada
  // ou uma excepção síncrona fora do pipeline do Nest morre sem log estruturado.
  process.on('unhandledRejection', (reason: unknown) => {
    logger.fatal({
      err: { message: reason instanceof Error ? reason.message : String(reason) },
      msg: 'unhandledRejection — encerrando processo',
    });
    process.exit(1);
  });
  process.on('uncaughtException', (err: Error) => {
    logger.fatal({
      err: { message: err.message, stack: err.stack },
      msg: 'uncaughtException — encerrando processo',
    });
    process.exit(1);
  });

  // ─── Security ────────────────────────────────────────────────────────────
  const isProd = process.env.NODE_ENV === 'production';

  // Atrás da borda Caddy: X-Forwarded-* passam a alimentar req.secure/req.ip.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  app.use(
    helmet({
      // Coerente com o HSTS emitido pela borda (auditoria A-1, achado B5).
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    }),
  );
  app.use(enforceHttpsMiddleware(isProd));
  app.use(compression());
  app.use(cookieParser());
  // Segunda camada de defesa CSRF, além de SameSite=Lax + CORS restrito
  // (ver csrf-header-guard.ts) — tem de correr depois do cookieParser.
  app.use(csrfHeaderMiddleware(TOKEN_COOKIE));

  // Estabelece o contexto de correlação (reqId) para toda a cadeia do pedido —
  // middleware corre depois do pino-http (que já atribuiu req.id) e antes dos
  // guards/interceptors/filters, que o preenchem (userId) ou o consomem.
  app.use((req: Request, _res: Response, next: () => void) => {
    runWithRequestContext({ reqId: (req as Request & { id?: string }).id }, next);
  });

  // ─── CORS ────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: parseAllowedOrigins(process.env.ALLOWED_ORIGINS, isProd),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ─── Validation ──────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Swagger ─────────────────────────────────────────────────────────────
  // Em produção, /docs e /docs-json exigem Bearer token (SWAGGER_TOKEN).
  // Nota: NestJS guards não se aplicam a rotas do SwaggerModule (nível Express);
  // o middleware Express é registado antes do setup do Swagger.
  if (isProd) {
    app.use(['/docs', '/docs-json'], createSwaggerAuthMiddleware(process.env.SWAGGER_TOKEN));
  }

  const config = new DocumentBuilder()
    .setTitle('INNOVA - ACADEMIA CORPORATIVA e RH')
    .setDescription('API completa para plataforma de Academia Corporativa e Recursos Humanos')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Autenticação e autorização')
    .addTag('Users', 'Gestão de utilizadores')
    .addTag('Departments', 'Departamentos')
    .addTag('Units', 'Unidades organizacionais')
    .addTag('Roles & Permissions', 'Roles e permissões')
    .addTag('Positions', 'Posições organizacionais')
    .addTag('Courses', 'Gestão de cursos')
    .addTag('Learning Paths', 'Trilhas de aprendizagem')
    .addTag('Course Modules & Lessons', 'Módulos e lições')
    .addTag('Enrollments', 'Matrículas')
    .addTag('Assessments', 'Avaliações e quizzes')
    .addTag('Competencies', 'Competências')
    .addTag('Development Plans', 'Planos de desenvolvimento')
    .addTag('Performance Reviews', 'Avaliações de desempenho')
    .addTag('Succession Planning', 'Planeamento de sucessão')
    .addTag('Onboarding', 'Integração de novos colaboradores')
    .addTag('Leadership Programs', 'Programas de liderança')
    .addTag('Knowledge Base', 'Base de conhecimento')
    .addTag('Micro Learning', 'Micro-aprendizagem')
    .addTag('Live Classes', 'Aulas ao vivo')
    .addTag('Trainings', 'Treinamentos presenciais')
    .addTag('Gamification', 'Pontos, badges e ranking')
    .addTag('Analytics & Intelligence', 'Análise e inteligência')
    .addTag('Executive Reports', 'Relatórios executivos')
    .addTag('Notifications', 'Notificações e automações')
    .addTag('Audit Logs', 'Logs de auditoria')
    .addTag('AI Tutor', 'Tutor com Inteligência Artificial')
    .addTag('Instructors', 'Gestão de instrutores')
    .addTag('Events', 'Eventos corporativos')
    .addTag('Employees (HR)', 'Colaboradores RH (legado)')
    .addTag('Careers', 'Carreira e progressão')
    .addTag('API Integration (Integrações com Sistemas Externos)')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) =>
      `${controllerKey}_${methodKey}`,
    extraModels: [],
  });

  const schemas = document.components?.schemas ?? {};
  const seen = new Set<string>();
  for (const key of Object.keys(schemas)) {
    const baseName = key.replace(/_\d+$/, '');
    if (seen.has(baseName)) {
      delete schemas[key];
    } else {
      seen.add(baseName);
    }
  }

  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
    },
  });

  app.getHttpAdapter().get('/', (req: Request, res: Response) => {
    res.json({
      name: 'INNOVA API',
      version: '1.0',
      status: 'running',
      docs: `${req.protocol}://${req.get('host')}/docs`,
      timestamp: new Date().toISOString(),
    });
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);

  logger.log(`INNOVA API running on: http://localhost:${port}`);
  logger.log(`Swagger docs available at: http://localhost:${port}/docs`);
}

bootstrap();
