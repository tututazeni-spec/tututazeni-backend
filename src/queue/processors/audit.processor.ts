import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { writeChainedAuditLog } from '../../common/helpers/audit-chain';
import type { AuditWriteData } from '../../common/services/audit.service';

@Processor('audit')
export class AuditProcessor {
  constructor(private readonly prisma: PrismaService) {}

  @Process('write')
  async handleWrite(job: Job<AuditWriteData>): Promise<void> {
    // Falha propaga-se: o Bull repete (3 tentativas) e o job falhado fica visível na fila.
    await writeChainedAuditLog(this.prisma, job.data);
  }
}
