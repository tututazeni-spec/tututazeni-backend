import {
  DEFAULT_BACKUP_SETTINGS,
  BackupSettings,
  backupFileName,
  frequencyMs,
  isBackupDue,
  isSafeBackupDir,
  lastScheduledSlot,
  nextScheduledSlot,
  parseBackupSettings,
  selectExpired,
} from './backup-settings';

const cfg = (over: Partial<BackupSettings> = {}): BackupSettings => ({
  ...DEFAULT_BACKUP_SETTINGS,
  enabled: true,
  destinationDir: '/var/backups',
  ...over,
});

// Datas em hora local (a agenda é "hora local do servidor"). 24/10/2026 é sábado.
const at = (m: number, d: number, h = 0, min = 0) => new Date(2026, m - 1, d, h, min);

describe('parseBackupSettings', () => {
  it.each([null, undefined, ''])('defaults para %p', raw => {
    expect(parseBackupSettings(raw)).toEqual(DEFAULT_BACKUP_SETTINGS);
  });

  it('JSON inválido cai nos defaults', () => {
    expect(parseBackupSettings('{x')).toEqual(DEFAULT_BACKUP_SETTINGS);
  });

  it('os backups nascem desactivados e sem destino', () => {
    expect(DEFAULT_BACKUP_SETTINGS.enabled).toBe(false);
    expect(DEFAULT_BACKUP_SETTINGS.destinationDir).toBe('');
  });

  it('sobrepõe só o que está guardado', () => {
    const s = parseBackupSettings(JSON.stringify({ frequency: 'WEEKLY', minCopies: 7 }));
    expect(s).toMatchObject({ frequency: 'WEEKLY', minCopies: 7, retentionDays: 30 });
  });
});

describe('agenda', () => {
  describe('DAILY (02:00)', () => {
    const s = cfg({ frequency: 'DAILY', hour: 2 });

    it('depois da hora: o último slot é hoje às 02:00 e o próximo amanhã', () => {
      const now = at(10, 24, 15, 30);
      expect(lastScheduledSlot(s, now)).toEqual(at(10, 24, 2));
      expect(nextScheduledSlot(s, now)).toEqual(at(10, 25, 2));
    });

    it('antes da hora: o último slot foi ontem', () => {
      expect(lastScheduledSlot(s, at(10, 24, 1))).toEqual(at(10, 23, 2));
    });

    it('exactamente à hora conta como slot actual', () => {
      expect(lastScheduledSlot(s, at(10, 24, 2, 0))).toEqual(at(10, 24, 2));
    });

    it('atravessa a mudança de mês', () => {
      expect(lastScheduledSlot(s, at(11, 1, 1))).toEqual(at(10, 31, 2));
    });
  });

  describe('WEEKLY (segunda = 1)', () => {
    const s = cfg({ frequency: 'WEEKLY', day: 1, hour: 2 });

    it('sábado: o último slot foi a segunda anterior e o próximo a segunda seguinte', () => {
      const now = at(10, 24, 15, 30);
      expect(lastScheduledSlot(s, now)).toEqual(at(10, 19, 2));
      expect(nextScheduledSlot(s, now)).toEqual(at(10, 26, 2));
    });

    it('na segunda antes da hora ainda vale a semana passada', () => {
      expect(lastScheduledSlot(s, at(10, 26, 1))).toEqual(at(10, 19, 2));
    });

    it('na segunda depois da hora vale hoje', () => {
      expect(lastScheduledSlot(s, at(10, 26, 3))).toEqual(at(10, 26, 2));
    });

    it('domingo (day=0) também funciona', () => {
      expect(lastScheduledSlot(cfg({ frequency: 'WEEKLY', day: 0 }), at(10, 24, 12))).toEqual(
        at(10, 18, 2),
      );
    });
  });

  describe('MONTHLY (dia 15)', () => {
    const s = cfg({ frequency: 'MONTHLY', day: 15, hour: 2 });

    it('depois do dia 15: slot deste mês, próximo no mês seguinte', () => {
      const now = at(10, 24, 12);
      expect(lastScheduledSlot(s, now)).toEqual(at(10, 15, 2));
      expect(nextScheduledSlot(s, now)).toEqual(at(11, 15, 2));
    });

    it('antes do dia 15: o último slot foi no mês anterior', () => {
      expect(lastScheduledSlot(s, at(10, 10, 12))).toEqual(at(9, 15, 2));
    });

    it('em Janeiro recua para Dezembro do ano anterior', () => {
      expect(lastScheduledSlot(s, new Date(2026, 0, 5, 12))).toEqual(new Date(2025, 11, 15, 2));
    });

    it('dia 28 (máximo permitido) existe em todos os meses, incluindo Fevereiro', () => {
      const feb = cfg({ frequency: 'MONTHLY', day: 28, hour: 2 });
      expect(lastScheduledSlot(feb, new Date(2026, 2, 1, 12))).toEqual(new Date(2026, 1, 28, 2));
    });
  });
});

describe('isBackupDue', () => {
  const now = at(10, 24, 15, 30); // último slot diário: 24/10 02:00

  it('nunca está em atraso se desactivado ou sem pasta de destino', () => {
    expect(isBackupDue(cfg({ enabled: false }), null, now)).toBe(false);
    expect(isBackupDue(cfg({ destinationDir: '' }), null, now)).toBe(false);
  });

  it('sem nenhum backup com sucesso está em atraso', () => {
    expect(isBackupDue(cfg(), null, now)).toBe(true);
  });

  it('último sucesso antes do slot → em atraso', () => {
    expect(isBackupDue(cfg(), at(10, 23, 2, 5), now)).toBe(true);
  });

  it('último sucesso depois do slot → em dia', () => {
    expect(isBackupDue(cfg(), at(10, 24, 2, 5), now)).toBe(false);
  });
});

describe('frequencyMs', () => {
  it('diário, semanal e mensal (31 dias, para ser conservador)', () => {
    const day = 24 * 3_600_000;
    expect(frequencyMs('DAILY')).toBe(day);
    expect(frequencyMs('WEEKLY')).toBe(7 * day);
    expect(frequencyMs('MONTHLY')).toBe(31 * day);
  });
});

describe('selectExpired (retenção)', () => {
  const now = at(10, 24, 12);
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const run = (id: number, ago: number) => ({ id, startedAt: daysAgo(ago) });

  it('elimina o que passou a retenção, mantendo as minCopies mais recentes', () => {
    const runs = [run(1, 100), run(2, 90), run(3, 40), run(4, 5), run(5, 1)];
    expect(selectExpired(runs, { retentionDays: 30, minCopies: 2 }, now).sort()).toEqual([1, 2, 3]);
  });

  it('nunca desce abaixo de minCopies, mesmo que todas estejam expiradas', () => {
    const runs = [run(1, 100), run(2, 90), run(3, 80)];
    expect(selectExpired(runs, { retentionDays: 30, minCopies: 3 }, now)).toEqual([]);
    expect(selectExpired(runs, { retentionDays: 30, minCopies: 1 }, now).sort()).toEqual([1, 2]);
  });

  it('não depende da ordem de entrada', () => {
    const a = [run(1, 100), run(2, 90), run(3, 80), run(4, 1)];
    const b = [...a].reverse();
    const opts = { retentionDays: 30, minCopies: 2 };
    expect(selectExpired(a, opts, now).sort()).toEqual(selectExpired(b, opts, now).sort());
  });

  it('uma cópia exactamente no limite da retenção ainda não expira', () => {
    expect(
      selectExpired([run(1, 30), run(2, 0)], { retentionDays: 30, minCopies: 1 }, now),
    ).toEqual([]);
  });

  it('não muta o array recebido', () => {
    const runs = [run(1, 1), run(2, 100)];
    selectExpired(runs, { retentionDays: 30, minCopies: 0 }, now);
    expect(runs.map(r => r.id)).toEqual([1, 2]);
  });

  it('lista vazia → nada a eliminar', () => {
    expect(selectExpired([], { retentionDays: 1, minCopies: 0 }, now)).toEqual([]);
  });
});

describe('backupFileName', () => {
  it('formato innova-AAAAMMDD-HHMMSS.dump com zeros à esquerda', () => {
    expect(backupFileName(new Date(2026, 0, 5, 3, 4, 9))).toBe('innova-20260105-030409.dump');
  });

  it('é ordenável por nome = ordenável por data', () => {
    const a = backupFileName(new Date(2026, 8, 30, 23, 59, 59));
    const b = backupFileName(new Date(2026, 9, 1, 0, 0, 0));
    expect(a < b).toBe(true);
  });
});

describe('isSafeBackupDir', () => {
  it.each(['/var/backups', '/', 'C:\\backups', 'C:/backups', 'd:\\x\\y'])('aceita %j', dir => {
    expect(isSafeBackupDir(dir)).toBe(true);
  });

  it.each([
    '',
    'backups',
    './backups',
    'relativo/caminho',
    '/var/../etc',
    'C:\\a\\..\\b',
    '..\\x',
    '/var/back\nups',
    '/var/back\0ups',
    '/var/back\rups',
    '\\\\servidor\\partilha',
  ])('rejeita %j', dir => {
    expect(isSafeBackupDir(dir)).toBe(false);
  });

  it('um ".." dentro de um nome (não como segmento) é aceite', () => {
    expect(isSafeBackupDir('/var/backups..old')).toBe(true);
  });
});
