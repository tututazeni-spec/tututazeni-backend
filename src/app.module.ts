import { Module } from '@nestjs/common';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { envValidationSchema } from './config/env.validation';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { buildThrottlerOptions } from './common/config/throttler.config';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { getRequestContext } from './common/logging/request-context';

// MÓDULOS ORIGINAIS
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DepartmentsModule } from './departments/departments.module';
import { CoursesModule } from './courses/courses.module';
import { CourseModulesModule } from './course-modules/course-modules.module';
import { EnrollmentsModule } from './enrollments/enrollments.module';
import { AssessmentsModule } from './assessments/assessments.module';
// CompetenciesModule único junta CompetenciesController (/competencies) e
// CompetencyMapController (/competency-map) — ex-CompetencyMapModule,
// fundido lá como "Competências".
import { CompetenciesModule } from './competencies/competencies.module';
import { DevelopmentPlansModule } from './development-plans/development-plans.module';
// SuccessionModule — módulo Career, secção 7 (Sucessão): cargos críticos,
// planos de sucessão, matriz e dashboard. Removido por engano na limpeza de
// "módulos legados" (#295) junto com módulos efectivamente mortos
// (leadership, engagement, avatar-training…); restaurado porque é o motor
// real por trás do separador "Sucessão" da spec docs/04-modulo-career.md.
import { SuccessionModule } from './succession/succession.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LiveClassesModule } from './live-classes/live-classes.module';
import { MobileModule } from './mobile/mobile.module';
import { ScalabilityModule } from './scalability/scalability.module';
import { TrainingModule } from './trainings/trainings.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { ExecutiveReportsModule } from './executive-reports/executive-reports.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { AiTutorModule } from './ai-tutor/ai-tutor.module';
import { EventsModule } from './events/events.module';
// UsersModule único junta UsersController (/users), EmployeesController
// (/employees) e RolesPermissionsController (/roles-permissions) — ex-
// EmployeesModule e ex-RolesPermissionsModule, fundidos lá como "Utilizadores".

// MÓDULOS NOVOS — RH
import { AttendanceModule } from './attendance/attendance.module';
import { LeaveManagementModule } from './leave-management/leave-management.module';
import { PayslipsModule } from './payslips/payslips.module';
import { WorkDeclarationModule } from './work-declaration/work-declaration.module';
import { DeclarationsModule } from './declarations/declarations.module';
import { DocumentRepositoryModule } from './document-repository/document-repository.module';

// MÓDULOS NOVOS — TALENTO E CARREIRA
// CareerModule único junta CareerController (/career) e CareerPlansController
// (/career-plans) — ex-CareerPlansModule, fundido aqui.
import { CareerModule } from './career/career.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { Evaluation360Module } from './evaluation360/evaluation360.module';

// MÓDULOS NOVOS — DASHBOARD E RELATÓRIOS
import { DashboardModule } from './dashboard/dashboard.module';
import { DashboardRhModule } from './dashboard-rh/dashboard-rh.module';
import { ReportsModule } from './reports/reports.module';
import { RoiImpactModule } from './roi-impact/roi-impact.module';
import { HistoryModule } from './history/history.module';

// MÓDULOS NOVOS — ORGANIZAÇÃO E ACESSOS
import { OrganizationModule } from './organization/organization.module';
import { AclModule } from './acl/acl.module';

// MÓDULOS NOVOS — PROCESSOS E INTEGRAÇÃO
import { ProcessStandardModule } from './process-standard/process-standard.module';
import { ApiIntegrationModule } from './api-integration/api-integration.module';
import { AutomationModule } from './automation/automation.module';
import { SearchModule } from './search/search.module';
import { PdfModule } from './pdf/pdf.module';
import { CrmBeneficiariesModule } from './crm-beneficiaries/crm-beneficiaries.module';
import { CrmPartnersModule } from './crm-partners/crm-partners.module';
import { CrmFundersModule } from './crm-funders/crm-funders.module';
// LibraryModule único junta LibraryController (/library — repositório
// documental), ContentLibraryController (/content-library — catálogo
// multimédia) e KnowledgeController (/knowledge — base de conhecimento) —
// ex-ContentLibraryModule e ex-KnowledgeModule, fundidos aqui.
import { LibraryModule } from './library/library.module';
import { DashboardInstitutionalModule } from './dashboard-institutional/dashboard-institutional.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

// INFRA
import { QueueModule } from './queue/queue.module';
import { CacheModule } from './cache/cache.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      validationOptions: { abortEarly: false },
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        autoLogging: false,
        genReqId: (req, res) => {
          const incoming = req.headers['x-request-id'];
          const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
          res.setHeader('x-request-id', id);
          return id;
        },
        customProps: req => ({ reqId: (req as { id?: string }).id }),
        // Injecta reqId/userId (via AsyncLocalStorage) em TODO log emitido durante o
        // pedido — inclusive nos `new Logger()` dos services, que passam pela mesma
        // instância pino sob o capô. Resolve a ausência de contexto sem obrigar a
        // reescrever a assinatura de cada chamada de log existente.
        mixin: () => getRequestContext(),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.newPassword',
            'req.body.currentPassword',
            'req.body.oldPassword',
            'req.body.token',
            'req.body.nif',
            'req.body.nib',
            'res.headers["set-cookie"]',
          ],
          remove: true,
        },
        transport:
          process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
      },
    }),
    QueueModule,
    CacheModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildThrottlerOptions,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    DepartmentsModule,
    CoursesModule,
    CourseModulesModule,
    EnrollmentsModule,
    AssessmentsModule,
    CompetenciesModule,
    DevelopmentPlansModule,
    SuccessionModule,
    OnboardingModule,
    LiveClassesModule,
    MobileModule,
    ScalabilityModule,
    TrainingModule,
    AnalyticsModule,
    ExecutiveReportsModule,
    NotificationsModule,
    AuditModule,
    AiTutorModule,
    EventsModule,
    AttendanceModule,
    LeaveManagementModule,
    PayslipsModule,
    PdfModule,
    WorkDeclarationModule,
    DeclarationsModule,
    DocumentRepositoryModule,
    CareerModule,
    EvaluationModule,
    Evaluation360Module,
    DashboardModule,
    DashboardRhModule,
    ReportsModule,
    RoiImpactModule,
    HistoryModule,
    OrganizationModule,
    AclModule,
    ProcessStandardModule,
    ApiIntegrationModule,
    AutomationModule,
    SearchModule,
    CrmBeneficiariesModule,
    CrmPartnersModule,
    CrmFundersModule,
    LibraryModule,
    DashboardInstitutionalModule,
    HealthModule,
    MetricsModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
