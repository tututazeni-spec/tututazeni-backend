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

// Corpo JSON por omissão: 1 MB. Só as rotas listadas em LARGE_BODY_PREFIXES (que recebem
// ficheiros inline em base64/data URL) mantêm 8 MB; o @MaxLength de cada DTO é a fronteira real.
// Montado antes do parser global pela mesma razão que applySmallBodyLimits (o primeiro limite vale).
export const DEFAULT_BODY_LIMIT = '1mb';
export const LARGE_BODY_LIMIT = '8mb';
export const LARGE_BODY_PREFIXES: readonly string[] = [
  '/users/me/avatar',
  '/courses',
  '/modules',
  '/lessons',
  '/certificates/templates',
  '/certificates/assets',
  '/avatar-training',
  '/library',
  '/crm-funders',
];

export function applyLargeBodyLimits(
  app: Pick<NestExpressApplication, 'use'>,
  prefixes: readonly string[] = LARGE_BODY_PREFIXES,
  limit: string = LARGE_BODY_LIMIT,
): void {
  for (const prefix of prefixes) app.use(prefix, json({ limit }));
}
