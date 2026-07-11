// src/mail/mail.service.ts
// Entrega de email abstraída atrás desta interface. A implementação actual
// regista a intenção (mesmo padrão dos stubs de scalability.events.ts); um
// SmtpMailService real liga-se depois via os SMTP_* do .env.production sem
// mudar os chamadores. NUNCA registar o token em texto claro.
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendPasswordReset(email: string, token: string): Promise<void> {
    void token; // entregue ao utilizador, nunca logado
    this.logger.log(
      `Password reset solicitado para ${email} (token gerado, entrega pendente de SMTP)`,
    );
  }
}
