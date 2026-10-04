import { Logger } from '@nestjs/common';
import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { writeChainedAuditLog } from '../../common/helpers/audit-chain';
import type { AuditWriteData } from '../../common/services/audit.service';

@Processor('audit')
export class AuditProcessor {
  private readonly logger = new Logger(AuditProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('write')
  async handleWrite(job: Job<AuditWriteData>): Promise<void> {
    // Falha propaga-se: o Bull repete (3 tentativas) e o job falhado fica visível na fila.
    await writeChainedAuditLog(this.prisma, job.data);
  }

  /** §15.9 — falha de gravação de auditoria nunca é silenciosa (log de erro + job fica em «failed»). */
  @OnQueueFailed()
  onFailed(job: Job<AuditWriteData>, err: Error): void {
    const final = job.attemptsMade >= (job.opts.attempts ?? 1);
    this.logger.error(
      `Falha ao gravar evento de auditoria ${job.data?.entity ?? '?'}/${job.data?.action ?? '?'} ` +
        `(tentativa ${job.attemptsMade}/${job.opts.attempts ?? 1}${final ? ', DEFINITIVA' : ''}): ${err.message}`,
    );
  }
}
