// src/common/files/inspect-inline-file.ts
// Ponto único de validação de ficheiros recebidos inline: o tipo vem dos BYTES, o MIME declarado
// só é aceite se bater com eles e com a política da categoria.
import { detectFileType, FileKind } from './detect-file-type';
import { FilePolicy } from './file-policies';
import { formatLimit, parseDataUrl } from './data-url';
import { reportUploadRejection, uploadValidationMode } from './upload-validation';
import {
  gifInfo,
  imageProblem,
  jpegInfo,
  ooxmlProblem,
  pdfProblem,
  pngInfo,
  webpInfo,
} from './inspect-content';

export interface InspectedFile {
  ok: true;
  /** MIME confirmado pelos bytes (é o que se deve gravar). */
  mime: string;
  kind: FileKind;
  ext: string;
  bytes: Buffer;
}
export type InspectResult = InspectedFile | { ok: false; error: string };

const EXT: Partial<Record<FileKind, string>> = {
  png: 'png',
  jpeg: 'jpg',
  gif: 'gif',
  webp: 'webp',
  pdf: 'pdf',
  docx: 'docx',
  xlsx: 'xlsx',
  pptx: 'pptx',
  text: 'txt',
};

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export interface InspectOptions {
  /** false: não regista a rejeição (usado ao recalcular só a mensagem de erro de um validador). */
  report?: boolean;
}

/** Valida bytes já descodificados contra o MIME declarado e a política. */
export function inspectBuffer(
  bytes: Buffer,
  declaredMime: string,
  policy: FilePolicy,
  options: InspectOptions = {},
): InspectResult {
  const report = options.report !== false;
  const declared = declaredMime.toLowerCase();
  const base = { policy: policy.name, declaredMime: declared, bytes: bytes.length };

  // Formato, tamanho e tipos fora da política recusam sempre, em qualquer modo.
  const hard = (stage: 'format' | 'size' | 'type', error: string) => {
    if (report) reportUploadRejection({ ...base, stage, reason: error, enforced: true });
    return fail(error);
  };
  if (bytes.length === 0) return hard('format', 'O ficheiro está vazio.');
  if (bytes.length > policy.maxBytes) {
    return hard('size', `O ficheiro excede ${formatLimit(policy.maxBytes)}.`);
  }
  if (!policy.mimes.includes(declared)) {
    return hard('type', `Tipo de ficheiro não permitido (${declared}).`);
  }

  const detected = detectFileType(bytes);
  let problem: string | null = null;
  if (detected.dangerous) {
    problem = `Ficheiro rejeitado: contém ${detected.dangerous}.`;
  } else if (detected.kind === 'unknown') {
    problem = 'Não foi possível identificar o tipo do ficheiro.';
  } else if (!detected.mimes.includes(declared)) {
    problem = 'O conteúdo do ficheiro não corresponde ao tipo declarado.';
  } else {
    problem = structuralProblem(detected.kind, bytes, policy);
  }

  if (problem) {
    // Falhas de CONTEÚDO: em modo warn só se regista (rollout); em enforce recusam.
    const enforced = uploadValidationMode() === 'enforce';
    if (report) {
      reportUploadRejection({
        ...base,
        stage: 'content',
        reason: problem,
        detectedKind: detected.kind,
        enforced,
      });
    }
    if (enforced) return fail(problem);
  }

  const ext = declared === 'text/csv' ? 'csv' : (EXT[detected.kind] ?? 'bin');
  return { ok: true, mime: declared, kind: detected.kind, ext, bytes };
}

function structuralProblem(kind: FileKind, bytes: Buffer, policy: FilePolicy): string | null {
  const maxDimension = policy.maxDimension ?? 4000;
  switch (kind) {
    case 'pdf':
      return pdfProblem(bytes);
    case 'docx':
    case 'xlsx':
    case 'pptx':
      return ooxmlProblem(bytes);
    case 'png':
      return imageProblem(pngInfo(bytes), maxDimension);
    case 'jpeg':
      return imageProblem(jpegInfo(bytes), maxDimension);
    case 'webp':
      return imageProblem(webpInfo(bytes), maxDimension);
    case 'gif':
      return imageProblem(gifInfo(bytes), maxDimension);
    default:
      return null;
  }
}

/** Valida um data URL base64: formato, tamanho, tipo real e estrutura. */
export function inspectInlineFile(
  dataUrl: unknown,
  policy: FilePolicy,
  options: InspectOptions = {},
): InspectResult {
  const parsed = parseDataUrl(dataUrl, policy.maxBytes);
  if (parsed.ok === false) {
    if (options.report !== false) {
      reportUploadRejection({
        policy: policy.name,
        stage: parsed.error.includes('excede') ? 'size' : 'format',
        reason: parsed.error,
        enforced: true,
      });
    }
    return parsed;
  }
  return inspectBuffer(parsed.bytes, parsed.declaredMime, policy, options);
}
