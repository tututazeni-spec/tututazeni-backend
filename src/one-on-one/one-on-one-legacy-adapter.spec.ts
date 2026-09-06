import { meetingToLeadershipShape } from './one-on-one-legacy-adapter';

describe('meetingToLeadershipShape', () => {
  const base = {
    id: 500,
    hostId: 10,
    participantId: 20,
    scheduledAt: new Date('2026-02-01'),
    durationMinutes: 30,
    status: 'SCHEDULED',
    agenda: 'x',
    meetingUrl: null,
    minutes: null,
    actionItems: null,
    nextMeetingDate: null,
    completedAt: null,
    createdAt: new Date('2026-01-01'),
    participant: { id: 20, fullName: 'Liderado' },
  };

  it('re-mapeia host/participant → manager/subordinate', () => {
    const out = meetingToLeadershipShape(base as any);
    expect(out.managerId).toBe(10);
    expect(out.subordinateId).toBe(20);
    expect(out.subordinate).toEqual({ id: 20, fullName: 'Liderado' });
  });

  it('id = legacyOneOnOneId quando presente (linha migrada)', () => {
    const out = meetingToLeadershipShape({ ...base, legacyOneOnOneId: 42 } as any);
    expect(out.id).toBe(42);
  });

  it('id = id do meeting quando não há legacyOneOnOneId (linha nova)', () => {
    const out = meetingToLeadershipShape(base as any);
    expect(out.id).toBe(500);
  });

  it('subordinate = null quando participant ausente (chave sempre presente)', () => {
    const { participant: _p, ...noParticipant } = base;
    const out = meetingToLeadershipShape(noParticipant as any);
    expect(out.subordinate).toBeNull();
  });
});
