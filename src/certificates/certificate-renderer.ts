import { PlanAssets } from './templates/plan-renderer';
import { BUILTIN_TEMPLATES } from './templates/builtin-templates';
import { renderConfigPdf } from './templates/template-render';
import { TemplateConfig } from './templates/template-config';
import { VariableValues } from './templates/template-variables';

/** Template (id, versão e configuração) embutido no certificado no momento da emissão. */
export interface SnapshotTemplate {
  id: string;
  version: number;
  config: TemplateConfig;
}

/** Dados impressos no certificado — guardados em Certificate.snapshot (JSON). */
export interface CertificateSnapshot {
  code: string;
  recipientName: string;
  title: string;
  hours?: number | null;
  score?: number;
  issuedAt: string;
  expiresAt?: string | null;
  issuerName: string;
  /** Ausente nos certificados anteriores à fatia de templates → corporativo clássico. */
  template?: SnapshotTemplate;
}

export function buildVerifyUrl(code: string): string {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/verify/${code}`;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-PT');

/**
 * Configuração e valores das variáveis a partir do snapshot. O template vem SEMPRE do
 * snapshot (nunca do template actual), por isso editar um modelo não altera os
 * certificados já emitidos.
 */
export function snapshotToTemplateInput(snapshot: CertificateSnapshot): {
  config: TemplateConfig;
  values: VariableValues;
} {
  const config = snapshot.template?.config ?? BUILTIN_TEMPLATES[0].config;
  const values: VariableValues = {
    nome_completo: snapshot.recipientName,
    nome_curso: snapshot.title,
    nome_formacao: snapshot.title,
    nome_empresa: snapshot.issuerName,
    codigo_certificado: snapshot.code,
    data_emissao: fmtDate(snapshot.issuedAt),
  };
  if (snapshot.hours) values.carga_horaria = `${snapshot.hours} h`;
  if (snapshot.score !== undefined && snapshot.score !== null) {
    values.nota_final = `${snapshot.score}%`;
  }
  if (snapshot.expiresAt) values.data_validade = fmtDate(snapshot.expiresAt);
  return { config, values };
}

/** `assets`: imagens já carregadas das referências do template do snapshot. */
export async function renderCertificatePdf(
  snapshot: CertificateSnapshot,
  verifyUrl: string,
  assets: PlanAssets = {},
): Promise<Buffer> {
  const { config, values } = snapshotToTemplateInput(snapshot);
  return renderConfigPdf(config, { values, verifyUrl }, assets);
}
