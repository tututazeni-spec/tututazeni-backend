// src/common/files/upload-validation.ts
// Modo de validação e relatório das rejeições de upload.
//
//  UPLOAD_VALIDATION_MODE=enforce (por omissão): a verificação do conteúdo real recusa o ficheiro.
//  UPLOAD_VALIDATION_MODE=warn: durante o rollout, as falhas de CONTEÚDO (tipo real ≠ declarado,
//    executável/HTML/SVG, estrutura de PDF/Office/imagem) são só registadas e o ficheiro passa.
//    Formato inválido, tamanho e tipos fora da política recusam sempre: já eram recusados antes.
//
// Cada rejeição (ou aviso) gera um log estruturado e é entregue aos "sinks" registados (o
// UploadRejectionAuditor grava-a no AuditLog). O contexto do pedido (reqId, userId, acção) vem
// do AsyncLocalStorage, por isso as funções puras de inspecção não precisam de injecção.
import { Logger } from '@nestjs/common';
import { getRequestContext } from '../logging/request-context';

export type UploadValidationMode = 'enforce' | 'warn';
export type UploadRejectionStage = 'format' | 'size' | 'type' | 'content' | 'scan' | 'remote';

export interface UploadRejection {
  policy: string;
  stage: UploadRejectionStage;
  reason: string;
  declaredMime?: string;
  detectedKind?: string;
  bytes?: number;
  /** false = modo warn: o ficheiro passou, a falha foi só registada. */
  enforced: boolean;
}

export interface UploadRejectionEvent extends UploadRejection {
  reqId?: string;
  userId?: number | string | null;
  action?: string;
}

export type UploadRejectionSink = (event: UploadRejectionEvent) => void;

const logger = new Logger('UploadValidation');
const sinks = new Set<UploadRejectionSink>();

/** Qualquer valor diferente de "warn" (incluindo typos) é enforce: falha segura. */
export function uploadValidationMode(env: NodeJS.ProcessEnv = process.env): UploadValidationMode {
  return String(env.UPLOAD_VALIDATION_MODE ?? '')
    .trim()
    .toLowerCase() === 'warn'
    ? 'warn'
    : 'enforce';
}

/** Regista um sink; devolve a função que o remove. */
export function addUploadRejectionSink(sink: UploadRejectionSink): () => void {
  sinks.add(sink);
  return () => sinks.delete(sink);
}

export function reportUploadRejection(rejection: UploadRejection): void {
  const ctx = getRequestContext();
  const event: UploadRejectionEvent = {
    ...rejection,
    reqId: ctx.reqId,
    userId: ctx.userId,
    action: ctx.action,
  };
  const message = `${rejection.enforced ? 'upload rejeitado' : 'upload com problema (modo warn, aceite)'}: ${rejection.reason}`;
  // Nunca registar o conteúdo nem o nome do ficheiro: só metadados.
  logger.warn({ event: 'upload_validation', ...event }, message);
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      // Um sink com falha não pode transformar uma rejeição num 500.
    }
  }
}
