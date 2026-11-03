import { BadRequestException } from '@nestjs/common';
import { MeetingProvider } from '@prisma/client';

// Domínios aceites por plataforma. Só https: o link é aberto no browser do
// participante, por isso rejeita-se `javascript:`, `http:` e hosts de terceiros.
const ZOOM_HOSTS = ['zoom.us', 'zoomgov.com', 'zoom.com'];
const TEAMS_HOSTS = ['teams.microsoft.com', 'teams.live.com', 'teams.microsoft.us'];

function hostMatches(host: string, allowed: string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some(a => h === a || h.endsWith(`.${a}`));
}

export interface NormalizedMeeting {
  /** Link final guardado em meetingUrl (null para JITSI). */
  url: string | null;
  /** ID numérico da reunião Zoom, quando se consegue extrair. */
  zoomId: string | null;
}

/**
 * Normaliza o que o organizador colou (link ou ID) para a plataforma escolhida.
 * - JITSI: não usa link externo.
 * - ZOOM: aceita o link (`zoom.us/j/123…`) ou só o ID (9–11 dígitos).
 * - TEAMS: exige o link da reunião (o ID sozinho não permite entrar).
 */
export function normalizeMeeting(
  provider: MeetingProvider,
  raw: string | null | undefined,
): NormalizedMeeting {
  if (provider === MeetingProvider.JITSI) return { url: null, zoomId: null };

  const value = (raw ?? '').trim();
  if (!value) {
    throw new BadRequestException(
      provider === MeetingProvider.ZOOM
        ? 'Cole o link ou o ID da reunião Zoom.'
        : 'Cole o link da reunião Teams.',
    );
  }

  if (provider === MeetingProvider.ZOOM) {
    const digits = value.replace(/[\s-]/g, '');
    if (/^\d{9,11}$/.test(digits)) {
      return { url: `https://zoom.us/j/${digits}`, zoomId: digits };
    }
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadRequestException(
      provider === MeetingProvider.ZOOM
        ? 'O ID ou link da reunião Zoom não é válido.'
        : 'O link da reunião Teams não é válido.',
    );
  }
  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('O link da reunião tem de começar por https://.');
  }
  const allowed = provider === MeetingProvider.ZOOM ? ZOOM_HOSTS : TEAMS_HOSTS;
  if (!hostMatches(parsed.hostname, allowed)) {
    throw new BadRequestException(
      provider === MeetingProvider.ZOOM
        ? 'O link tem de ser de zoom.us.'
        : 'O link tem de ser de teams.microsoft.com ou teams.live.com.',
    );
  }

  const zoomId =
    provider === MeetingProvider.ZOOM
      ? (parsed.pathname.match(/\/(?:j|w|wc\/join)\/(\d{9,11})/)?.[1] ?? null)
      : null;
  return { url: parsed.toString(), zoomId };
}
