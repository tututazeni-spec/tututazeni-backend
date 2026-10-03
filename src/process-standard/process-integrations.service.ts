// src/process-standard/process-integrations.service.ts
// Integração com os módulos da INNOVA (docs/Modulo_Processes.md §15 e §16):
//  • matriz com o estado real de cada módulo (actividade, não declarações);
//  • recepção de eventos que iniciam processos, idempotente (regra 5), com
//    permissões verificadas (regra 4) e registo de falhas (regra 6);
//  • repetição controlada de eventos falhados, limitada pela configuração.
// O módulo de origem mantém os seus dados; aqui só se cria o processo, por
// `startInstance` (regra 3 — nunca se escreve nas tabelas dos outros módulos).
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUserData } from '../common/decorators';
import { ProcessStandardService } from './process-standard.service';
import { writeProcessAuditLog } from './process-audit';
import { loadSetting } from './process-settings.loader';
import {
  catalogIndex,
  emptyMetrics,
  INTEGRATION_CATALOG,
  integrationStatus,
  IntegrationMetrics,
  laterOf,
  normalizeModule,
  scopedIdempotencyKey,
} from './process-integrations';
import { IntegrationEventDto, IntegrationLogFilterDto } from './process-standard.dto';

interface IntegrationsConfig {
  inboundEnabled: boolean;
  enabledModules: string[];
  maxPayloadKb: number;
}
interface AutomationLimits {
  maxRetries: number;
}

const OPEN: Array<'IN_PROGRESS' | 'ON_HOLD'> = ['IN_PROGRESS', 'ON_HOLD'];

@Injectable()
export class ProcessIntegrationsService {
  private readonly logger = new Logger(ProcessIntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly processes: ProcessStandardService,
  ) {}

  // ─── Matriz ────────────────────────────────────────────────────────────────

  async overview() {
    const idx = catalogIndex();
    const metrics = new Map<string, IntegrationMetrics>();
    const of = (name: string | null | undefined) => {
      const entry = idx.get(normalizeModule(name));
      if (!entry) return null;
      if (!metrics.has(entry.key)) metrics.set(entry.key, emptyMetrics());
      return metrics.get(entry.key);
    };
    const unmapped = new Set<string>();

    const [bySource, templates, logs, cfg] = await Promise.all([
      this.prisma.read.processInstance.groupBy({
        by: ['sourceModule', 'status'],
        where: { sourceModule: { not: null } },
        _count: { _all: true },
        _max: { startedAt: true },
      }),
      this.prisma.read.processStandard.findMany({
        where: { involvedModules: { isEmpty: false } },
        select: { involvedModules: true },
        take: 5000,
      }),
      this.prisma.read.processIntegrationLog.groupBy({
        by: ['module', 'status'],
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      loadSetting<IntegrationsConfig>(this.prisma, 'integrations'),
    ]);

    for (const r of bySource) {
      const m = of(r.sourceModule);
      if (!m) {
        if (r.sourceModule) unmapped.add(r.sourceModule);
        continue;
      }
      m.instances += r._count._all;
      if ((OPEN as string[]).includes(r.status)) m.openInstances += r._count._all;
      m.lastActivityAt = laterOf(m.lastActivityAt, r._max.startedAt);
    }
    for (const t of templates) {
      for (const name of new Set(t.involvedModules)) {
        const m = of(name);
        if (m) m.templates += 1;
        else unmapped.add(name);
      }
    }
    for (const l of logs) {
      const m = of(l.module);
      if (!m) {
        unmapped.add(l.module);
        continue;
      }
      m.events += l._count._all;
      if (l.status === 'FAILED' || l.status === 'REJECTED') m.failedEvents += l._count._all;
      m.lastActivityAt = laterOf(m.lastActivityAt, l._max.createdAt);
    }

    const allowed = new Set(cfg.enabledModules.map(normalizeModule));
    const modules = INTEGRATION_CATALOG.map(c => {
      const m = metrics.get(c.key) ?? emptyMetrics();
      return {
        key: c.key,
        label: c.label,
        description: c.description,
        note: c.note ?? null,
        status: integrationStatus(m),
        ...m,
        inboundAllowed:
          cfg.inboundEnabled && (allowed.size === 0 || allowed.has(normalizeModule(c.key))),
      };
    });
    return {
      inboundEnabled: cfg.inboundEnabled,
      restrictedToModules: cfg.enabledModules.length > 0,
      summary: {
        total: modules.length,
        active: modules.filter(m => m.status === 'ACTIVE').length,
        configured: modules.filter(m => m.status === 'CONFIGURED').length,
        withErrors: modules.filter(m => m.status === 'ERRORS').length,
        noActivity: modules.filter(m => m.status === 'NO_ACTIVITY').length,
      },
      modules,
      unmappedModules: [...unmapped].sort(),
    };
  }

  // ─── Recepção de eventos ───────────────────────────────────────────────────

  async receive(dto: IntegrationEventDto, user: CurrentUserData) {
    const cfg = await loadSetting<IntegrationsConfig>(this.prisma, 'integrations');
    const key = scopedIdempotencyKey(dto.module, dto.idempotencyKey);
    const payload = JSON.stringify(dto);

    const reject = async (message: string): Promise<never> => {
      await this.record({ dto, key: null, status: 'REJECTED', error: message, user, payload });
      throw new ForbiddenException(message);
    };
    if (!cfg.inboundEnabled) return reject('A recepção de eventos de integração está desactivada');
    const allowed = cfg.enabledModules.map(normalizeModule);
    if (allowed.length && !allowed.includes(normalizeModule(dto.module))) {
      return reject(`O módulo "${dto.module}" não está autorizado a iniciar processos`);
    }
    if (Buffer.byteLength(payload) > cfg.maxPayloadKb * 1024) {
      throw new BadRequestException(`Payload acima do limite de ${cfg.maxPayloadKb} KB`);
    }

    // Idempotência: a chave única decide, mesmo com pedidos concorrentes.
    const existing = await this.prisma.processIntegrationLog.findUnique({
      where: { idempotencyKey: key },
    });
    if (existing) return this.handleExisting(existing, dto, user);

    let log;
    try {
      log = await this.prisma.processIntegrationLog.create({
        data: {
          module: dto.module,
          event: dto.event,
          idempotencyKey: key,
          correlationId: dto.correlationId ?? null,
          status: 'RECEIVED',
          processCode: dto.processCode,
          payload,
          actorId: user.id,
        },
      });
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const again = await this.prisma.processIntegrationLog.findUnique({
          where: { idempotencyKey: key },
        });
        if (again) return this.handleExisting(again, dto, user);
      }
      throw e;
    }
    return this.run(log.id, dto, user);
  }

  private async handleExisting(
    log: { id: number; status: string; instanceId: number | null },
    dto: IntegrationEventDto,
    user: CurrentUserData,
  ) {
    if (log.status === 'FAILED') return this.run(log.id, dto, user, true);
    if (log.status === 'RECEIVED') {
      throw new ConflictException('Este evento já está a ser processado');
    }
    // SUCCESS / DUPLICATE: devolve o resultado original sem criar nada.
    await this.prisma.processIntegrationLog.update({
      where: { id: log.id },
      data: { attempts: { increment: 1 } },
    });
    return { status: 'DUPLICATE' as const, logId: log.id, instanceId: log.instanceId };
  }

  private async run(
    logId: number,
    dto: IntegrationEventDto,
    user: CurrentUserData,
    isRetry = false,
  ) {
    try {
      const template = await this.prisma.processStandard.findUnique({
        where: { code: dto.processCode },
        select: { id: true },
      });
      if (!template) throw new NotFoundException(`Modelo "${dto.processCode}" não encontrado`);
      const inst = await this.processes.startInstance(
        template.id,
        user.id,
        {
          targetUserId: dto.targetUserId,
          title: dto.title,
          priority: dto.priority,
          sourceModule: dto.module,
          sourceEntityType: dto.sourceEntityType,
          sourceEntityId: dto.sourceEntityId,
          notes: `Iniciado por evento "${dto.event}" do módulo ${dto.module}`,
        },
        user,
      );
      await this.prisma.processIntegrationLog.update({
        where: { id: logId },
        data: {
          status: 'SUCCESS',
          instanceId: inst.id,
          errorMessage: null,
          ...(isRetry ? { attempts: { increment: 1 } } : {}),
        },
      });
      await writeProcessAuditLog(this.prisma, this.logger, {
        userId: user.id,
        instanceId: inst.id,
        action: isRetry ? 'INTEGRATION_RETRY' : 'INTEGRATION_EVENT_ACCEPTED',
        source: 'API',
        correlationId: dto.correlationId,
        meta: {
          module: dto.module,
          event: dto.event,
          logId,
          sourceEntityType: dto.sourceEntityType,
          sourceEntityId: dto.sourceEntityId,
        },
      });
      return { status: 'CREATED' as const, logId, instanceId: inst.id, code: inst.code };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro desconhecido';
      // Pedido de origem que já tem processo activo → duplicado, não falha.
      if (e instanceof ConflictException) {
        const dup = await this.prisma.processInstance.findFirst({
          where: {
            sourceEntityType: dto.sourceEntityType,
            sourceEntityId: dto.sourceEntityId,
            status: { in: OPEN },
            process: { code: dto.processCode },
          },
          select: { id: true },
        });
        await this.prisma.processIntegrationLog.update({
          where: { id: logId },
          data: {
            status: 'DUPLICATE',
            instanceId: dup?.id ?? null,
            errorMessage: message,
            ...(isRetry ? { attempts: { increment: 1 } } : {}),
          },
        });
        return { status: 'DUPLICATE' as const, logId, instanceId: dup?.id ?? null };
      }
      await this.prisma.processIntegrationLog.update({
        where: { id: logId },
        data: {
          status: 'FAILED',
          errorMessage: message.slice(0, 500),
          ...(isRetry ? { attempts: { increment: 1 } } : {}),
        },
      });
      await writeProcessAuditLog(this.prisma, this.logger, {
        userId: user.id,
        action: 'INTEGRATION_EVENT_FAILED',
        source: 'API',
        result: 'FAILED',
        errorMessage: message.slice(0, 500),
        correlationId: dto.correlationId,
        meta: { module: dto.module, event: dto.event, logId },
      });
      throw e instanceof HttpException ? e : new BadRequestException(message);
    }
  }

  private async record(a: {
    dto: IntegrationEventDto;
    key: string | null;
    status: 'REJECTED' | 'FAILED';
    error: string;
    user: CurrentUserData;
    payload: string;
  }) {
    await this.prisma.processIntegrationLog.create({
      data: {
        module: a.dto.module,
        event: a.dto.event,
        idempotencyKey: a.key,
        correlationId: a.dto.correlationId ?? null,
        status: a.status,
        processCode: a.dto.processCode,
        payload: a.payload,
        errorMessage: a.error,
        actorId: a.user.id,
      },
    });
  }

  // ─── Registos e repetição ──────────────────────────────────────────────────

  async logs(f: IntegrationLogFilterDto) {
    const page = f.page ?? 1;
    const limit = f.limit ?? 20;
    const where: Prisma.ProcessIntegrationLogWhereInput = {
      ...(f.module ? { module: f.module } : {}),
      ...(f.status ? { status: f.status } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.read.processIntegrationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        // O payload completo só é útil na repetição — não se expõe na lista.
        select: {
          id: true,
          module: true,
          event: true,
          status: true,
          attempts: true,
          processCode: true,
          instanceId: true,
          errorMessage: true,
          correlationId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.read.processIntegrationLog.count({ where }),
    ]);
    return { data: rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  async retry(id: number, user: CurrentUserData) {
    const log = await this.prisma.processIntegrationLog.findUnique({ where: { id } });
    if (!log) throw new NotFoundException('Registo de integração não encontrado');
    if (log.status !== 'FAILED') {
      throw new BadRequestException('Só é possível repetir eventos que falharam');
    }
    const limits = await loadSetting<AutomationLimits>(this.prisma, 'automationLimits');
    if (log.attempts > limits.maxRetries) {
      throw new BadRequestException(
        `Limite de ${limits.maxRetries} repetições atingido para este evento`,
      );
    }
    if (!log.payload) throw new BadRequestException('O evento não guardou o payload original');
    const dto = JSON.parse(log.payload) as IntegrationEventDto;
    return this.run(log.id, dto, user, true);
  }
}
