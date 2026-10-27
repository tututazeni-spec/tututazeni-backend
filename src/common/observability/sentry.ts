import * as Sentry from '@sentry/node';

let enabled = false;

/**
 * Liga o Sentry só se SENTRY_DSN estiver definido; sem DSN tudo aqui é no-op.
 * Chamar antes de criar a app Nest.
 */
export function initSentry(env: NodeJS.ProcessEnv = process.env): boolean {
  const dsn = env.SENTRY_DSN?.trim();
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: env.NODE_ENV ?? 'production',
    release: env.BUILD_SHA && env.BUILD_SHA !== 'unknown' ? `innova@${env.BUILD_SHA}` : undefined,
    tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE ?? 0) || 0,
    // Dados pessoais de colaboradores (RH): por omissão o SDK recolhe cookies, cabeçalhos,
    // corpos e query params — desligamos tudo; o stack trace e as tags bastam.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.headers;
      }
      return event;
    },
  });
  enabled = true;
  return true;
}

/** Envia só erros 5xx (os 4xx são ruído do cliente). */
export function captureServerError(error: unknown, context: Record<string, string | undefined>) {
  if (!enabled) return;
  Sentry.withScope(scope => {
    for (const [key, value] of Object.entries(context)) {
      if (value) scope.setTag(key, value);
    }
    Sentry.captureException(error);
  });
}

export function flushSentry(timeoutMs = 2000): Promise<boolean> {
  return enabled ? Sentry.flush(timeoutMs) : Promise.resolve(true);
}
