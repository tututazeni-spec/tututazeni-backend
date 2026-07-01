import { PinoLogger } from 'nestjs-pino';

export interface PrismaQueryEvent {
  query: string;
  params: string;
  duration: number;
  target: string;
}

type QueryLogger = Pick<PinoLogger, 'warn' | 'debug'>;

/**
 * Loga uma query do Prisma com o tempo de execução.
 * - >= slowQueryMs → warn (slow query, com params)
 * - <  slowQueryMs → debug (todas as queries têm tempo)
 */
export function logQueryEvent(
  logger: QueryLogger,
  event: PrismaQueryEvent,
  slowQueryMs: number,
): void {
  if (event.duration >= slowQueryMs) {
    logger.warn(
      {
        durationMs: event.duration,
        query: event.query,
        params: event.params,
        target: event.target,
      },
      'slow query',
    );
  } else {
    logger.debug(
      { durationMs: event.duration, query: event.query, target: event.target },
      'db query',
    );
  }
}
