import { BadRequestException } from '@nestjs/common';
import { MeetingProvider } from '@prisma/client';
import { normalizeMeeting } from './meeting-link.util';

describe('normalizeMeeting', () => {
  it('JITSI ignora o link', () => {
    expect(normalizeMeeting(MeetingProvider.JITSI, 'qualquer coisa')).toEqual({
      url: null,
      zoomId: null,
    });
  });

  it('Zoom: converte o ID em link e aceita espaços/hífenes', () => {
    expect(normalizeMeeting(MeetingProvider.ZOOM, '123 4567 8901')).toEqual({
      url: 'https://zoom.us/j/12345678901',
      zoomId: '12345678901',
    });
  });

  it('Zoom: aceita link e extrai o ID', () => {
    const r = normalizeMeeting(
      MeetingProvider.ZOOM,
      'https://us02web.zoom.us/j/84012345678?pwd=abc',
    );
    expect(r.zoomId).toBe('84012345678');
    expect(r.url).toContain('us02web.zoom.us');
  });

  it('Teams: aceita links teams.microsoft.com e teams.live.com', () => {
    expect(
      normalizeMeeting(MeetingProvider.TEAMS, 'https://teams.microsoft.com/l/meetup-join/19%3a...')
        .url,
    ).toContain('teams.microsoft.com');
    expect(normalizeMeeting(MeetingProvider.TEAMS, 'https://teams.live.com/meet/9551').url).toBe(
      'https://teams.live.com/meet/9551',
    );
  });

  it.each([
    [MeetingProvider.ZOOM, ''],
    [MeetingProvider.TEAMS, '   '],
    [MeetingProvider.TEAMS, '123456789'],
    // eslint-disable-next-line no-script-url
    [MeetingProvider.ZOOM, 'javascript:alert(1)'],
    [MeetingProvider.ZOOM, 'http://zoom.us/j/123456789'],
    [MeetingProvider.ZOOM, 'https://zoom.us.evil.com/j/123456789'],
    [MeetingProvider.ZOOM, 'https://evilzoom.us/j/123456789'],
    [MeetingProvider.TEAMS, 'https://zoom.us/j/123456789'],
  ])('%s rejeita "%s"', (provider, value) => {
    expect(() => normalizeMeeting(provider, value)).toThrow(BadRequestException);
  });
});
