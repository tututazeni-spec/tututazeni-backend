// src/content-library/strip-inline-files.interceptor.ts
// Conteúdos podem guardar o ficheiro inline (`url` = data URL base64, até 5 MB).
// Listas, tendências, recomendações, etc. não devem arrastar esses megabytes:
// aqui o `url` inline é substituído por '' e o item ganha `hasInlineFile: true`.
// O detalhe (`GET /content-library/:id`) devolve o `url` completo — é por aí
// que o frontend vai buscar o ficheiro ao abrir o conteúdo.
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = strip(v);
    if (typeof obj.url === 'string' && obj.url.startsWith('data:')) {
      out.url = '';
      out.hasInlineFile = true;
    }
    return out;
  }
  return value;
}

@Injectable()
export class StripInlineFilesInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      route?: { path?: string };
    }>();
    const isDetail = req.method === 'GET' && (req.route?.path ?? '').endsWith('/:id');
    return isDetail ? next.handle() : next.handle().pipe(map(strip));
  }
}
