import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { captureServerError } from '../observability/sentry';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext('AllExceptionsFilter');
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    // Normalmente o pino-http já preencheu req.id. Mas para exceções lançadas
    // antes desse middleware correr, req.id fica indefinido — nesse caso honramos
    // o header x-request-id recebido ou geramos um, garantindo sempre o id na
    // resposta (corpo + header).
    const incoming = req.headers?.['x-request-id'];
    const requestId = req.id ?? (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
    if (!res.getHeader('x-request-id')) {
      res.setHeader('x-request-id', requestId);
    }

    // Erros 4xx vindos de middlewares (ex.: body-parser -> 413 "entity.too.large") não são
    // HttpException do Nest; sem isto seriam reportados como 500.
    const rawStatus = (exception as { status?: unknown } | null)?.status;
    const clientStatus =
      !(exception instanceof HttpException) &&
      typeof rawStatus === 'number' &&
      rawStatus >= 400 &&
      rawStatus < 500
        ? rawStatus
        : undefined;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : (clientStatus ?? HttpStatus.INTERNAL_SERVER_ERROR);

    // Preserva o payload estruturado das HttpException (ex.: o array de mensagens
    // do ValidationPipe). Usar exception.message colapsaria isso para a string
    // genérica "Bad Request Exception" e perderia os detalhes por campo.
    let message: unknown = clientStatus ? 'Pedido inválido' : 'Internal server error';
    if (clientStatus === 413) {
      message = 'O pedido é demasiado grande (por exemplo, uma imagem pesada).';
    }
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      message =
        typeof response === 'string'
          ? response
          : ((response as Record<string, unknown>).message ?? exception.message);
    }

    const isServerError = status >= 500;
    // Stack trace completo em TODOS os erros (regra 2). A resposta ao cliente
    // nunca o inclui — só o log.
    const err =
      exception instanceof Error
        ? { message: exception.message, stack: exception.stack }
        : { value: exception };

    const logPayload = {
      statusCode: status,
      method: req.method,
      path: req.originalUrl?.split('?')[0] ?? req.url,
      err,
    };
    const logMessage = exception instanceof Error ? exception.message : 'Unknown exception';
    if (isServerError) {
      this.logger.error(logPayload, logMessage);
      captureServerError(exception, {
        requestId,
        method: req.method,
        route: logPayload.path,
      });
    } else this.logger.warn(logPayload, logMessage);

    res.status(status).json({
      statusCode: status,
      message,
      requestId,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
