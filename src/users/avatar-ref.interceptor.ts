import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { refUserAvatars } from './avatar-ref';

// Rede de segurança global: nenhuma resposta JSON leva o base64 do avatar de um
// utilizador (dezenas/centenas de KB por linha, sem cache no browser). Ver avatar-ref.ts.
@Injectable()
export class AvatarRefInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(body => refUserAvatars(body)));
  }
}
