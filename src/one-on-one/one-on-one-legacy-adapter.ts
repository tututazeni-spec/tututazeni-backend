// src/one-on-one/one-on-one-legacy-adapter.ts
// Fase G4 — re-mapeia a forma canónica (OneOnOneMeeting: hostId/participantId)
// para o contrato histórico de /leadership/1on1 (OneOnOne: managerId/
// subordinateId). Chaves sempre presentes; extras (host/participant/legacy*)
// toleradas.

export interface LeadershipMeetingShape {
  id: number;
  managerId: number;
  subordinateId: number;
  scheduledAt: Date;
  durationMinutes: number;
  status: string;
  agenda: string | null;
  meetingUrl: string | null;
  minutes: string | null;
  actionItems: string | null;
  nextMeetingDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  subordinate: unknown;
  [k: string]: unknown;
}

interface MeetingLike {
  id: number;
  hostId: number;
  participantId: number;
  legacyOneOnOneId?: number | null;
  participant?: unknown;
  [k: string]: unknown;
}

export function meetingToLeadershipShape(m: MeetingLike): LeadershipMeetingShape {
  return {
    ...m,
    // Linhas migradas preservam o id do OneOnOne legado (que o frontend possa
    // ter em cache); as novas usam o id do OneOnOneMeeting.
    id: m.legacyOneOnOneId ?? m.id,
    managerId: m.hostId,
    subordinateId: m.participantId,
    subordinate: m.participant ?? null,
  } as unknown as LeadershipMeetingShape;
}
