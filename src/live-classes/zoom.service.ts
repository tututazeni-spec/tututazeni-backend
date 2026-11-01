import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

export interface ZoomMeetingInput {
  topic: string;
  startTime: Date;
  durationMinutes: number;
  timezone?: string;
}

export interface ZoomMeeting {
  id: string;
  joinUrl: string;
  passcode: string | null;
}

/**
 * Cria reuniões Zoom via app Server-to-Server OAuth (ZOOM_ACCOUNT_ID,
 * ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET). Scope necessário: meeting:write:admin.
 */
@Injectable()
export class ZoomService {
  private readonly logger = new Logger(ZoomService.name);
  private token: { value: string; expiresAt: number } | null = null;

  isConfigured(): boolean {
    return !!(
      process.env.ZOOM_ACCOUNT_ID &&
      process.env.ZOOM_CLIENT_ID &&
      process.env.ZOOM_CLIENT_SECRET
    );
  }

  private async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 30_000) return this.token.value;
    const basic = Buffer.from(
      `${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`,
    ).toString('base64');
    const res = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(
        process.env.ZOOM_ACCOUNT_ID ?? '',
      )}`,
      { method: 'POST', headers: { Authorization: `Basic ${basic}` } },
    );
    if (!res.ok) {
      this.logger.error(`Zoom OAuth falhou: ${res.status} ${await res.text()}`);
      throw new BadGatewayException(
        'Não foi possível autenticar no Zoom. Verifique as credenciais.',
      );
    }
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  async createMeeting(input: ZoomMeetingInput): Promise<ZoomMeeting> {
    const token = await this.getToken();
    const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: input.topic.slice(0, 200),
        type: 2,
        start_time: input.startTime.toISOString(),
        duration: input.durationMinutes,
        timezone: input.timezone ?? 'UTC',
        settings: { join_before_host: false, waiting_room: true },
      }),
    });
    if (!res.ok) {
      this.logger.error(`Zoom criar reunião falhou: ${res.status} ${await res.text()}`);
      throw new BadGatewayException('O Zoom recusou a criação da reunião. Tente novamente.');
    }
    const m = (await res.json()) as { id: number; join_url: string; password?: string };
    return { id: String(m.id), joinUrl: m.join_url, passcode: m.password ?? null };
  }
}
