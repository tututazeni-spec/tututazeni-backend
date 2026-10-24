// src/common/files/upload-rejection.auditor.ts
// Grava no AuditLog canónico cada upload recusado (ou, em modo warn, assinalado). O volume é
// limitado pelo @UploadThrottle (20 pedidos/min/utilizador), por isso não dá para inundar a tabela.
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuditService } from '../services/audit.service';
import { addUploadRejectionSink, UploadRejectionEvent } from './upload-validation';

type Severity = 'LOW' | 'MEDIUM' | 'HIGH';

/** Executável/HTML/SVG disfarçado é o que interessa à segurança; o resto é ruído de utilizador. */
export function severityOf(e: UploadRejectionEvent): Severity {
  // Executável, HTML/SVG disfarçado ou malware detectado: o que interessa à segurança.
  if (e.reason.startsWith('Ficheiro rejeitado')) return 'HIGH';
  return e.stage === 'content' || e.stage === 'scan' || e.stage === 'remote' ? 'MEDIUM' : 'LOW';
}

@Injectable()
export class UploadRejectionAuditor implements OnModuleInit, OnModuleDestroy {
  private remove?: () => void;

  constructor(private readonly audit: AuditService) {}

  onModuleInit(): void {
    this.remove = addUploadRejectionSink(e => this.record(e));
  }

  onModuleDestroy(): void {
    this.remove?.();
  }

  record(e: UploadRejectionEvent): void {
    // Sem utilizador (rota pública) não há a quem atribuir: fica só no log estruturado.
    if (e.userId === undefined || e.userId === null) return;
    void this.audit
      .log({
        userId: e.userId,
        action: e.enforced ? 'UPLOAD_REJECTED' : 'UPLOAD_FLAGGED',
        entity: 'UploadValidation',
        module: 'Administração',
        status: e.enforced ? 'DENIED' : 'SUCCESS',
        severity: severityOf(e),
        reason: e.reason,
        source: 'API',
        correlationId: e.reqId,
        metadata: {
          policy: e.policy,
          stage: e.stage,
          declaredMime: e.declaredMime,
          detectedKind: e.detectedKind,
          bytes: e.bytes,
          enforced: e.enforced,
          endpoint: e.action,
        },
      })
      .catch(() => undefined); // auditar nunca pode fazer falhar o pedido
  }
}
