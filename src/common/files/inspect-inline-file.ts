// src/common/files/inspect-inline-file.ts
// Ponto único de validação de ficheiros recebidos inline: o tipo vem dos BYTES, o MIME declarado
// só é aceite se bater com eles e com a política da categoria.
import { detectFileType, FileKind } from './detect-file-type';
import { FilePolicy } from './file-policies';
import { formatLimit, parseDataUrl } from './data-url';
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

/** Valida bytes já descodificados contra o MIME declarado e a política. */
export function inspectBuffer(
  bytes: Buffer,
  declaredMime: string,
  policy: FilePolicy,
): InspectResult {
  const declared = declaredMime.toLowerCase();
  if (bytes.length === 0) return fail('O ficheiro está vazio.');
  if (bytes.length > policy.maxBytes) {
    return fail(`O ficheiro excede ${formatLimit(policy.maxBytes)}.`);
  }
  if (!policy.mimes.includes(declared)) {
    return fail(`Tipo de ficheiro não permitido (${declared}).`);
  }

  const detected = detectFileType(bytes);
  if (detected.dangerous) {
    return fail(`Ficheiro rejeitado: contém ${detected.dangerous}.`);
  }
  if (detected.kind === 'unknown') {
    return fail('Não foi possível identificar o tipo do ficheiro.');
  }
  if (!detected.mimes.includes(declared)) {
    return fail('O conteúdo do ficheiro não corresponde ao tipo declarado.');
  }

  let problem: string | null = null;
  switch (detected.kind) {
    case 'pdf':
      problem = pdfProblem(bytes);
      break;
    case 'docx':
    case 'xlsx':
    case 'pptx':
      problem = ooxmlProblem(bytes);
      break;
    case 'png':
      problem = imageProblem(pngInfo(bytes), policy.maxDimension ?? 4000);
      break;
    case 'jpeg':
      problem = imageProblem(jpegInfo(bytes), policy.maxDimension ?? 4000);
      break;
    case 'webp':
      problem = imageProblem(webpInfo(bytes), policy.maxDimension ?? 4000);
      break;
    case 'gif':
      problem = imageProblem(gifInfo(bytes), policy.maxDimension ?? 4000);
      break;
    default:
      break;
  }
  if (problem) return fail(problem);

  const ext = declared === 'text/csv' ? 'csv' : (EXT[detected.kind] ?? 'bin');
  return { ok: true, mime: declared, kind: detected.kind, ext, bytes };
}

/** Valida um data URL base64: formato, tamanho, tipo real e estrutura. */
export function inspectInlineFile(dataUrl: unknown, policy: FilePolicy): InspectResult {
  const parsed = parseDataUrl(dataUrl, policy.maxBytes);
  if (parsed.ok === false) return parsed;
  return inspectBuffer(parsed.bytes, parsed.declaredMime, policy);
}
