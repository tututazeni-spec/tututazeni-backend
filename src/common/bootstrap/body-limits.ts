// src/common/bootstrap/body-limits.ts
// O parser JSON global aceita até 8 MB porque algumas rotas autenticadas recebem ficheiros inline
// (avatar, PDFs de lição, comprovativos). As rotas de autenticação são públicas e nunca recebem
// ficheiros: ali o corpo fica limitado a 100 KB, para não oferecer 8 MB por pedido a quem não
// tem sessão. Tem de ser montado ANTES de `app.useBodyParser`: o body-parser salta o pedido que
// já foi lido (req._body), por isso o primeiro limite que se aplica é o que vale.
import { json } from 'express';
import type { NestExpressApplication } from '@nestjs/platform-express';

export const SMALL_BODY_LIMIT = '100kb';
export const SMALL_BODY_PREFIXES: readonly string[] = ['/auth'];

export function applySmallBodyLimits(
  app: Pick<NestExpressApplication, 'use'>,
  prefixes: readonly string[] = SMALL_BODY_PREFIXES,
  limit: string = SMALL_BODY_LIMIT,
): void {
  for (const prefix of prefixes) app.use(prefix, json({ limit }));
}
