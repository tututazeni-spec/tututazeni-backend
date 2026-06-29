import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext('AllExceptionsFilter');
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    // Preserva o payload estruturado das HttpException (ex.: o array de mensagens
    // do ValidationPipe). Usar exception.message colapsaria isso para a string
    // genérica "Bad Request Exception" e perderia os detalhes por campo.
    let message: unknown = 'Internal server error';
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      message =
        typeof response === 'string'
          ? response
          : ((response as Record<string, unknown>).message ?? exception.message);
    }

    const isServerError = status >= 500;
    // Stack trace só em 5xx. Erros de cliente (401/403/404) são rotineiros e,
    // sob carga, gerariam ruído e custo de serialização desnecessários.
    const err =
      exception instanceof Error
        ? { message: exception.message, ...(isServerError ? { stack: exception.stack } : {}) }
        : { value: exception };

    const logPayload = { statusCode: status, method: req.method, path: req.url, err };
    const logMessage = exception instanceof Error ? exception.message : 'Unknown exception';
    if (isServerError) this.logger.error(logPayload, logMessage);
    else this.logger.warn(logPayload, logMessage);

    res.status(status).json({
      statusCode: status,
      message,
      requestId: req.id,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
