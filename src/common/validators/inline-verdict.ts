// src/common/validators/inline-verdict.ts
// Veredicto de um ficheiro inline para os decorators: inspecção estrutural (síncrona) e, se o
// antivírus estiver ligado, verificação do clamd (assíncrona). Devolve boolean quando o
// antivírus está desligado (comportamento idêntico ao anterior, incluindo validateSync) e
// Promise<boolean> só quando há de facto algo assíncrono a esperar.
//
// O motivo da recusa é guardado por objecto+propriedade: `defaultMessage` do class-validator é
// síncrono e não consegue esperar pelo resultado do antivírus.
import { antivirusConfig, scanForUpload } from '../files/antivirus';
import { FilePolicy } from '../files/file-policies';
import { inspectInlineFile } from '../files/inspect-inline-file';

const reasons = new WeakMap<object, Map<string, string>>();

function remember(obj: object | undefined, prop: string, reason: string | null): void {
  if (!obj) return;
  const m = reasons.get(obj) ?? new Map<string, string>();
  if (reason) m.set(prop, reason);
  else m.delete(prop);
  reasons.set(obj, m);
}

/** Motivo da última recusa deste campo, se o veredicto já correu. */
export function recallReason(obj: object | undefined, prop: string): string | undefined {
  return obj ? reasons.get(obj)?.get(prop) : undefined;
}

export function inlineVerdict(
  value: string,
  policy: FilePolicy,
  obj: object | undefined,
  prop: string,
): boolean | Promise<boolean> {
  const r = inspectInlineFile(value, policy);
  if (r.ok === false) {
    remember(obj, prop, r.error);
    return false;
  }
  const cfg = antivirusConfig();
  if (!cfg.enabled) {
    remember(obj, prop, null);
    return true;
  }
  return scanForUpload(r.bytes, { policy: policy.name, declaredMime: r.mime }, cfg).then(
    rejection => {
      remember(obj, prop, rejection);
      return rejection === null;
    },
  );
}
