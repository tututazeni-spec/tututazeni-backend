import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  // ─── Security ────────────────────────────────────────────────────────────
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // ─── CORS ────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:3000'],
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

  app.getHttpAdapter().get('/', (_req: Request, res: Response) => {
    res.json({
      name: 'INNOVA API',
      version: '1.0',
      status: 'running',
      docs: `http://localhost:${port}/docs`,
      timestamp: new Date().toISOString(),
    });
  });

  app.getHttpAdapter().get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  const port = process.env.PORT ?? 4000;
  await app.listen(port);

  console.log(`\n🚀 INNOVA API running on: http://localhost:${port}`);
  console.log(`📚 Swagger docs available at: http://localhost:${port}/docs\n`);
}

bootstrap();
