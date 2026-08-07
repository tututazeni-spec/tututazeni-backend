import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @InjectPinoLogger(LoggingInterceptor.name)
    private readonly logger: PinoLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const { method, user } = req;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        this.logger.info(
          { method, userId: user?.id ?? null, reqId: req.id ?? null, ms: Date.now() - now },
          'http',
        );
      }),
    );
  }
}
