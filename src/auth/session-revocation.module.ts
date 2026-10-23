import { Global, Module } from '@nestjs/common';
import { SessionRevocationService } from './session-revocation.service';

// Global: Auth, Users e Roles injectam-no sem importar AuthModule (evita dependências circulares).
@Global()
@Module({ providers: [SessionRevocationService], exports: [SessionRevocationService] })
export class SessionRevocationModule {}
