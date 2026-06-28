import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';

@Processor('audit')
export class AuditProcessor {
  constructor(private readonly prisma: PrismaService) {}

  @Process('write')
  async handleWrite(job: Job): Promise<void> {
    await this.prisma.auditLog.create({ data: job.data });
  }
}
