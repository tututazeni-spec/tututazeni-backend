import { CohortsExportService } from './cohorts-export.service';

const sheet = {
  cohort: { id: 7, name: 'Turma Lisboa', courseTitle: 'Liderança' },
  days: ['2026-11-02', '2026-11-04'],
  participants: [
    {
      userId: 1,
      fullName: 'Ana Silva',
      avatarUrl: null,
      marks: { '2026-11-02': 'PRESENT', '2026-11-04': 'ABSENT' },
      present: 1,
      absent: 1,
      total: 2,
    },
    {
      userId: 2,
      fullName: 'Rui Costa',
      avatarUrl: null,
      marks: {},
      present: 0,
      absent: 0,
      total: 2,
    },
  ],
};

describe('CohortsExportService.exportAttendance', () => {
  const user = { id: 9, role: { name: 'ADMIN' } } as any;
  let courses: { getCohortAttendanceSheet: jest.Mock };
  let audit: { log: jest.Mock };
  let service: CohortsExportService;

  beforeEach(() => {
    courses = { getCohortAttendanceSheet: jest.fn().mockResolvedValue(sheet) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new CohortsExportService(courses as any, audit as any);
  });

  it('gera um PDF e audita a exportação', async () => {
    const file = await service.exportAttendance(7, 'pdf', user);
    expect(file.contentType).toBe('application/pdf');
    expect(file.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(file.filename).toMatch(/^presencas-turma-lisboa-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'COHORT_ATTENDANCE_EXPORTED',
        userId: 9,
        metadata: expect.objectContaining({ cohortId: 7, format: 'pdf', days: 2 }),
      }),
    );
  });

  it('gera um Excel (ficheiro zip) e passa o actor à folha para validar o âmbito', async () => {
    const file = await service.exportAttendance(7, 'xlsx', user);
    expect(file.filename.endsWith('.xlsx')).toBe(true);
    expect(file.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(courses.getCohortAttendanceSheet).toHaveBeenCalledWith(7, user);
  });

  it('não audita nem entrega nada se o utilizador não tem acesso à turma', async () => {
    courses.getCohortAttendanceSheet.mockRejectedValue(new Error('Sem acesso a esta turma'));
    await expect(service.exportAttendance(7, 'pdf', user)).rejects.toThrow('Sem acesso');
    expect(audit.log).not.toHaveBeenCalled();
  });
});
