import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { swallow } from '../common/logging/swallow';

/** E-mails transacionais de faturação para o contacto do cliente; nunca falham o fluxo que os dispara. */
@Injectable()
export class BillingNotifierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async notify(subject: string, lines: string[]): Promise<void> {
    const t = await this.prisma.tenantConfig
      .findFirst({ select: { contactEmail: true } })
      .catch(swallow('billing-notifier', 'falha a ler contacto do cliente', null, 'warn'));
    if (!t?.contactEmail) return;
    await this.mail
      .sendNotification(t.contactEmail, subject, [...lines, '', '-- Sistema INNOVA'].join('\n'))
      .catch(swallow('billing-notifier', 'falha a enviar e-mail de faturação', undefined, 'warn'));
  }
}
