// ============================================================
// INNOVA PLATFORM — SCALABILITY MODULE — EVENT LISTENERS
// src/modules/scalability/scalability.events.ts
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { ScalabilityService } from './scalability.service';
import { AutomationTrigger } from './scalability.dto';

@Injectable()
export class ScalabilityEventListeners {
  private readonly logger = new Logger(ScalabilityEventListeners.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly service: ScalabilityService,
  ) {}

  /**
   * Quando um utilizador é contratado (via ERP sync ou criação manual)
   * → Disparar automações USER_HIRED
   */
  @OnEvent('user.hired')
  async onUserHired(payload: {
    userId: string;
    tenantId: string;
    departmentId?: string;
    positionId?: string;
  }) {
    this.logger.log(`[AutomationEvent] USER_HIRED → userId:${payload.userId}`);
    await this.service.processAutomationEvent(
      payload.tenantId,
      AutomationTrigger.USER_HIRED,
      payload,
    );
  }

  /**
   * Promoção de utilizador → Disparar automações USER_PROMOTED
   */
  @OnEvent('user.promoted')
  async onUserPromoted(payload: { userId: string; tenantId: string; newPositionId: string }) {
    this.logger.log(`[AutomationEvent] USER_PROMOTED → userId:${payload.userId}`);
    await this.service.processAutomationEvent(
      payload.tenantId,
      AutomationTrigger.USER_PROMOTED,
      payload,
    );
  }

  /**
   * Conclusão de curso → Disparar automações COURSE_COMPLETED
   */
  @OnEvent('course.completed')
  async onCourseCompleted(payload: { userId: string; tenantId: string; courseId: string }) {
    this.logger.log(
      `[AutomationEvent] COURSE_COMPLETED → userId:${payload.userId}, courseId:${payload.courseId}`,
    );
    await this.service.processAutomationEvent(
      payload.tenantId,
      AutomationTrigger.COURSE_COMPLETED,
      payload,
    );
  }

  /**
   * Certificado expirado → Disparar recertificação
   */
  @OnEvent('certificate.expired')
  async onCertificateExpired(payload: { userId: string; tenantId: string; certificateId: string }) {
    this.logger.log(`[AutomationEvent] CERTIFICATE_EXPIRED → userId:${payload.userId}`);
    await this.service.processAutomationEvent(
      payload.tenantId,
      AutomationTrigger.CERTIFICATE_EXPIRED,
      payload,
    );
  }

  /**
   * Sincronização de integração solicitada → executar sync
   */
  @OnEvent('integration.sync.requested')
  async onSyncRequested(payload: {
    integrationId: string;
    syncLogId: string;
    type: string;
    configJson?: string | null;
    actorId: string;
  }) {
    this.logger.log(`[IntegrationSync] Starting sync for integration:${payload.integrationId}`);
    try {
      // Em produção: chamar adaptador específico por tipo (ERPAdapter, SlackAdapter, etc.)
      // Por agora: simular sucesso e actualizar log
      await new Promise(r => setTimeout(r, 1500)); // simular tempo de processamento

      await (this.prisma as any).integrationSyncLog.update({
        where: { id: payload.syncLogId },
        data: {
          status: 'SUCCESS',
          finishedAt: new Date(),
          recordsProcessed: 0,
        },
      });

      await (this.prisma as any).integrationConfig.update({
        where: { id: payload.integrationId },
        data: { lastSyncAt: new Date(), lastSyncStatus: 'SUCCESS', lastSyncError: null },
      });

      this.logger.log(`[IntegrationSync] Completed: ${payload.integrationId}`);
    } catch (err) {
      this.logger.error(
        `[IntegrationSync] Failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      await (this.prisma as any).integrationSyncLog.update({
        where: { id: payload.syncLogId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
      await (this.prisma as any).integrationConfig.update({
        where: { id: payload.integrationId },
        data: { lastSyncAt: new Date(), lastSyncStatus: 'SUCCESS', lastSyncError: null },
      });
    }
  }

  /**
   * Execução de automação assíncrona
   */
  @OnEvent('automation.rule.execute')
  async onAutomationExecute(payload: {
    executionId: string;
    rule: any;
    targetUserId?: string;
    actorId: string;
  }) {
    this.logger.log(
      `[Automation] Executing rule:${payload.rule.id}, execution:${payload.executionId}`,
    );
    try {
      await (this.prisma as any).automationExecution.update({
        where: { id: payload.executionId },
        data: { status: 'RUNNING' },
      });

      await this.service.processAutomationEvent(payload.rule.tenantId, payload.rule.triggerType, {
        userId: payload.targetUserId,
      });

      await (this.prisma as any).automationExecution.update({
        where: { id: payload.executionId },
        data: { status: 'SUCCESS', finishedAt: new Date() },
      });
    } catch (err) {
      await (this.prisma as any).automationExecution.update({
        where: { id: payload.executionId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: err instanceof Error ? err.message : String(err),
        },
      });
    }
  }

  /**
   * Alertas → Notificar via Email
   */
  @OnEvent('alert.notify.email')
  async onAlertEmail(payload: { alert: any }) {
    const { alert } = payload;
    this.logger.warn(`[Alert:EMAIL] [${alert.severity}] ${alert.title}: ${alert.message}`);
    // TODO: Integrar com MailService (nodemailer / SES / SendGrid)
  }

  /**
   * Alertas → Notificar via Push
   */
  @OnEvent('alert.notify.push')
  async onAlertPush(payload: { alert: any }) {
    const { alert } = payload;
    this.logger.warn(`[Alert:PUSH] [${alert.severity}] ${alert.title}`);
    // TODO: Integrar com Firebase FCM / OneSignal
  }

  /**
   * Alertas → Notificar via Slack
   */
  @OnEvent('alert.notify.slack')
  async onAlertSlack(payload: { alert: any }) {
    const { alert } = payload;
    this.logger.warn(`[Alert:SLACK] [${alert.severity}] ${alert.title}`);
    // TODO: Enviar para webhook do Slack configurado na IntegrationConfig do tenant
  }

  /**
   * Email de boas-vindas após importação
   */
  @OnEvent('user.welcome.email')
  async onWelcomeEmail(payload: { userId: string }) {
    this.logger.log(`[Welcome] Sending welcome email to userId:${payload.userId}`);
    // TODO: Integrar com MailService
  }

  /**
   * Teste de carga agendado
   */
  @OnEvent('loadtest.scheduled')
  async onLoadTestScheduled(payload: any) {
    this.logger.log(
      `[LoadTest] Scheduled: ${payload.concurrentUsers} users, ${payload.durationSeconds}s on ${payload.targetEndpoint}`,
    );
    // TODO: Integrar com k6 / Locust via subprocess ou API externa
  }
}
