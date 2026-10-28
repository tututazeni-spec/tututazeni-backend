import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagsService } from './feature-flags.service';

export const FEATURE_FLAG_KEY = 'featureFlag';

// Uso: @RequireFeature('nova-folha') @UseGuards(FeatureFlagGuard) num handler ou controller.
// Com a flag desligada para o utilizador responde 404, como se a rota não existisse.
export const RequireFeature = (flag: string) => SetMetadata(FEATURE_FLAG_KEY, flag);

@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlagsService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const flag = this.reflector.getAllAndOverride<string | undefined>(FEATURE_FLAG_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!flag) return true;
    const userId = context.switchToHttp().getRequest().user?.id;
    if (this.flags.isEnabled(flag, userId)) return true;
    throw new NotFoundException();
  }
}
