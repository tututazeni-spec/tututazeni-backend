// src/common/files/inspect-scanned.ts
// Inspecção estrutural (síncrona) seguida do antivírus (assíncrono, opt-in). É o ponto de entrada
// dos validadores assíncronos e dos serviços que recebem ficheiros; com o antivírus desligado
// comporta-se exactamente como inspectInlineFile/inspectBuffer.
import { scanForUpload } from './antivirus';
import { FilePolicy } from './file-policies';
import {
  InspectOptions,
  InspectResult,
  inspectBuffer,
  inspectInlineFile,
} from './inspect-inline-file';

async function withScan(result: InspectResult, policy: FilePolicy): Promise<InspectResult> {
  if (result.ok === false) return result;
  const rejection = await scanForUpload(result.bytes, {
    policy: policy.name,
    declaredMime: result.mime,
  });
  return rejection ? { ok: false, error: rejection } : result;
}

export async function inspectBufferScanned(
  bytes: Buffer,
  declaredMime: string,
  policy: FilePolicy,
  options: InspectOptions = {},
): Promise<InspectResult> {
  return withScan(inspectBuffer(bytes, declaredMime, policy, options), policy);
}

export async function inspectInlineFileScanned(
  dataUrl: unknown,
  policy: FilePolicy,
  options: InspectOptions = {},
): Promise<InspectResult> {
  return withScan(inspectInlineFile(dataUrl, policy, options), policy);
}
