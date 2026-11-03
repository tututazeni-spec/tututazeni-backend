// src/common/authz/external-live-class-scope.guard.ts
// Posse de aulas ao vivo para o instrutor externo (fase 3): a aula do pedido (e a sessão ou a
// presença, se indicadas) tem de ser da aula em que ele é instrutor/co-instrutor. No-op para os
// restantes papéis, por isso pode ficar ligado a handlers partilhados com ADMIN/RH/alunos.
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { isExternalInstructor, ownInstructorProfileId } from './external-scope';

export const EXTERNAL_LIVE_CLASS_SCOPE_KEY = 'externalLiveClassScope';

export interface LiveClassScopeSpec {
  /** Parâmetro de rota com o id da aula. */
  key: string;
  /** Parâmetro de rota com o id de uma sessão (tem de pertencer à aula). */
  sessionKey?: string;
  /** Parâmetro de rota com o id de uma presença (tem de pertencer à aula). */
  attendanceKey?: string;
}

export const ExternalLiveClassScope = (spec: LiveClassScopeSpec = { key: 'id' }) =>
  SetMetadata(EXTERNAL_LIVE_CLASS_SCOPE_KEY, spec);

const NOT_FOUND = 'Recurso não encontrado';

function toId(raw: unknown): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new NotFoundException(NOT_FOUND);
  return id;
}

@Injectable()
export class ExternalLiveClassScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const spec = this.reflector.getAllAndOverride<LiveClassScopeSpec | undefined>(
      EXTERNAL_LIVE_CLASS_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!spec || !user || !isExternalInstructor(user)) return true;

    const liveClassId = toId(req.params?.[spec.key]);
    const profileId = await ownInstructorProfileId(this.prisma, user);
    if (profileId === null) throw new NotFoundException(NOT_FOUND);
    const own = await this.prisma.liveClass.findFirst({
      where: { id: liveClassId, OR: [{ instructorId: profileId }, { coInstructorId: profileId }] },
      select: { id: true },
    });
    if (!own) throw new NotFoundException(NOT_FOUND);

    if (spec.sessionKey) {
      const sessionId = toId(req.params?.[spec.sessionKey]);
      const session = await this.prisma.liveClassSession.findFirst({
        where: { id: sessionId, liveClassId },
        select: { id: true },
      });
      if (!session) throw new NotFoundException(NOT_FOUND);
    }
    if (spec.attendanceKey) {
      const attendanceId = toId(req.params?.[spec.attendanceKey]);
      const attendance = await this.prisma.liveAttendance.findFirst({
        where: { id: attendanceId, liveClassId },
        select: { id: true },
      });
      if (!attendance) throw new NotFoundException(NOT_FOUND);
    }
    return true;
  }
}
