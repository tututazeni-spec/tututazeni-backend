import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException ? exception.message : 'Internal server error';

    const logPayload = {
      statusCode: status,
      method: req.method,
      path: req.url,
      err:
        exception instanceof Error
          ? { message: exception.message, stack: exception.stack }
          : { value: exception },
    };
    if (status >= 500) this.logger.error(logPayload, message);
    else this.logger.warn(logPayload, message);

    res.status(status).json({
      statusCode: status,
      message,
      requestId: req.id,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }
}
