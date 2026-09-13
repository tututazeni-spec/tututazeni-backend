// src/sms/sms.service.ts
// SMS + WhatsApp via Twilio — mesmo padrão do MailService (src/mail/mail.service.ts):
// se as variáveis de ambiente não estiverem definidas, a app continua a
// funcionar e limita-se a avisar nos logs em vez de rebentar.
//
// Variáveis (ver .env.example):
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN — credenciais da conta Twilio
//   TWILIO_SMS_FROM      — número Twilio em formato E.164 (ex: +2449XXXXXXX) para SMS
//   TWILIO_WHATSAPP_FROM — número Twilio com WhatsApp activo (sandbox ou produção),
//                          sem o prefixo "whatsapp:" — este código adiciona-o
//
// Os destinatários (User.phone) têm de estar em E.164 — este serviço não
// normaliza/valida o formato, só reencaminha para a API da Twilio (que
// rejeita números inválidos — o erro fica registado no log, nunca rebenta
// a acção que despoletou o envio).
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Twilio } from 'twilio';
import { sanitizeForLog } from '../common/logging/sanitize';

@Injectable()
export class SmsService implements OnModuleInit {
  private readonly logger = new Logger(SmsService.name);
  private client: Twilio | null = null;
  private smsFrom?: string;
  private whatsappFrom?: string;

  onModuleInit(): void {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) {
      this.logger.warn(
        'TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN não definidos — SMS/WhatsApp não serão enviados',
      );
      return;
    }
    this.client = new Twilio(sid, token);
    this.smsFrom = process.env.TWILIO_SMS_FROM;
    this.whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
  }

  async sendSms(to: string, body: string): Promise<void> {
    if (!this.client || !this.smsFrom) {
      this.logger.warn({
        to: sanitizeForLog(to),
        msg: 'SMS não enviado — Twilio não configurado (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_SMS_FROM)',
      });
      return;
    }
    try {
      await this.client.messages.create({ to, from: this.smsFrom, body });
    } catch (err: unknown) {
      this.logger.error({
        to: sanitizeForLog(to),
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao enviar SMS via Twilio',
      });
      throw err;
    }
  }

  async sendWhatsApp(to: string, body: string): Promise<void> {
    if (!this.client || !this.whatsappFrom) {
      this.logger.warn({
        to: sanitizeForLog(to),
        msg: 'WhatsApp não enviado — Twilio não configurado (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_WHATSAPP_FROM)',
      });
      return;
    }
    try {
      await this.client.messages.create({
        to: `whatsapp:${to}`,
        from: `whatsapp:${this.whatsappFrom.replace(/^whatsapp:/, '')}`,
        body,
      });
    } catch (err: unknown) {
      this.logger.error({
        to: sanitizeForLog(to),
        err: { message: err instanceof Error ? err.message : String(err) },
        msg: 'Falha ao enviar WhatsApp via Twilio',
      });
      throw err;
    }
  }
}
