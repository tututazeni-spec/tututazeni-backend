import { Test, TestingModule } from '@nestjs/testing';
import * as crypto from 'crypto';
import { AuditService } from './audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditSeverity, AuditStatus } from './audit.dto';

function expectedHash(
  userId: number | null,
  action: string,
  entity: string,
  entityId: number | undefined,
  timestamp: Date,
  previousHash: string,
) {
  const payload = `${userId}|${action}|${entity}|${entityId ?? ''}|${timestamp.toISOString()}|${previousHash}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

describe('AuditService — cadeia de hash (imutabilidade)', () => {
  let service: AuditService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      auditLog: {
        create: jest.fn(dto => Promise.resolve({ id: 1, ...dto.data })),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      notificationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AuditService>(AuditService);
  });

  it('primeiro log da cadeia usa GENESIS como previousHash', async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue(null);
    await service.log({ userId: 1, action: 'CREATE', entity: 'User', entityId: 5 });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ previousHash: 'GENESIS' }) }),
    );
  });

  it('log encadeia o hash do registo anterior', async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue({ hash: 'hash-anterior' });
    await service.log({ userId: 1, action: 'CREATE', entity: 'User', entityId: 5 });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ previousHash: 'hash-anterior' }) }),
    );
  });

  it('o hash gravado corresponde exactamente à fórmula sha256 documentada', async () => {
    mockPrisma.auditLog.findFirst.mockResolvedValue({ hash: 'prev-hash' });
    let capturedTimestamp: Date;
    mockPrisma.auditLog.create.mockImplementation(({ data }: any) => {
      capturedTimestamp = data.timestamp;
      return Promise.resolve({ id: 1, ...data });
    });

    await service.log({ userId: 7, action: 'DELETE', entity: 'User', entityId: 5 });

    const created = mockPrisma.auditLog.create.mock.calls[0][0].data;
    const expected = expectedHash(7, 'DELETE', 'User', 5, capturedTimestamp!, 'prev-hash');
    expect(created.hash).toBe(expected);
  });

  it('log não propaga excepção se a escrita falhar (não reverte a operação de negócio)', async () => {
    mockPrisma.auditLog.create.mockRejectedValueOnce(new Error('db indisponível'));
    await expect(
      service.log({ userId: 1, action: 'CREATE', entity: 'User', entityId: 1 }),
    ).resolves.toBeUndefined();
  });
});

describe('AuditService — severidade inferida e atalhos semânticos', () => {
  let service: AuditService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      auditLog: {
        create: jest.fn(dto => Promise.resolve({ id: 1, ...dto.data })),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      notificationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AuditService>(AuditService);
  });

  it('entidade sensível (User/Payslip/Role/...) é sempre HIGH, mesmo em CREATE', async () => {
    await service.log({ userId: 1, action: 'CREATE', entity: 'Payslip', entityId: 1 });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severity: AuditSeverity.HIGH }) }),
    );
  });

  it('acção crítica (DELETE/LOGIN/FAILED/DENIED/EXPORT) em entidade não sensível é HIGH', async () => {
    await service.log({ userId: 1, action: 'DELETE', entity: 'Course', entityId: 1 });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severity: AuditSeverity.HIGH }) }),
    );
  });

  it('acção UPDATE/APPROVE/REJECT em entidade não sensível é MEDIUM', async () => {
    await service.log({ userId: 1, action: 'UPDATE', entity: 'Course', entityId: 1 });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ severity: AuditSeverity.MEDIUM }),
      }),
    );
  });

  it('acção neutra em entidade não sensível é LOW por omissão', async () => {
    await service.log({ userId: 1, action: 'READ', entity: 'Course', entityId: 1 });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ severity: AuditSeverity.LOW }) }),
    );
  });

  it('logLogin(sucesso) grava status SUCCESS e severidade MEDIUM', async () => {
    await service.logLogin(1, true, '10.0.0.1', 'agent');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'LOGIN',
          status: AuditStatus.SUCCESS,
          severity: AuditSeverity.MEDIUM,
        }),
      }),
    );
  });

  it('logLogin(falha) grava action FAILED, status FAILED e severidade HIGH', async () => {
    await service.logLogin(1, false, '10.0.0.1');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'FAILED',
          status: AuditStatus.FAILED,
          severity: AuditSeverity.HIGH,
        }),
      }),
    );
  });

  it('logExport regista metadata com formato e contagem', async () => {
    await service.logExport(1, 'User', 'csv', 250, '10.0.0.1');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'EXPORT',
          metadata: JSON.stringify({ format: 'csv', count: 250 }),
        }),
      }),
    );
  });

  it('logSensitiveRead marca leitura de dado sensível como HIGH', async () => {
    await service.logSensitiveRead(1, 'Payslip', 5, '10.0.0.1');
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'READ', severity: AuditSeverity.HIGH }),
      }),
    );
  });

  it('logUpdate calcula apenas os campos que mudaram (diff)', async () => {
    await service.logUpdate(1, 'User', 1, { name: 'A', age: 30 }, { name: 'B', age: 30 });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changes: JSON.stringify({ name: { from: 'A', to: 'B' } }),
        }),
      }),
    );
  });

  it('logUpdate sem before/after produz changes vazio', async () => {
    await service.logUpdate(1, 'User', 1);
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ changes: JSON.stringify({}) }) }),
    );
  });
});

describe('AuditService — detecção de anomalias', () => {
  let service: AuditService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      auditLog: {
        create: jest.fn(dto => Promise.resolve({ id: 1, ...dto.data })),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn(),
      },
      notificationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AuditService>(AuditService);
  });

  it('>=5 logins falhados em 5min dispara alerta de segurança para o admin', async () => {
    mockPrisma.auditLog.count.mockResolvedValue(5);
    await service.logLogin(9, false);
    // detectAnomalies corre em background (catch), aguarda o microtask
    await new Promise(process.nextTick);

    expect(mockPrisma.notificationLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 1, type: 'SECURITY_ALERT', priority: 'CRITICAL' }),
      }),
    );
  });

  it('<5 logins falhados não dispara alerta', async () => {
    mockPrisma.auditLog.count.mockResolvedValue(2);
    await service.logLogin(9, false);
    await new Promise(process.nextTick);

    expect(mockPrisma.notificationLog.create).not.toHaveBeenCalled();
  });

  it('falha ao notificar a anomalia não propaga excepção', async () => {
    mockPrisma.auditLog.count.mockResolvedValue(5);
    mockPrisma.notificationLog.create.mockRejectedValueOnce(new Error('fila cheia'));

    await expect(service.logLogin(9, false)).resolves.toBeDefined();
    await new Promise(process.nextTick);
  });

  it('detectAnomalies ignora entradas de sistema sem userId', async () => {
    await service.log({ userId: null, action: 'FAILED', entity: 'Auth' });
    await new Promise(process.nextTick);
    expect(mockPrisma.auditLog.count).not.toHaveBeenCalled();
  });
});

describe('AuditService — consulta, timeline, histórico e stats', () => {
  let service: AuditService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 1 }),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        create: jest.fn(dto => Promise.resolve({ id: 1, ...dto.data })),
      },
      historyRecord: { findMany: jest.fn().mockResolvedValue([]) },
      notificationLog: { create: jest.fn().mockResolvedValue({}) },
    };
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AuditService>(AuditService);
  });

  it('findAll aplica filtro criticalOnly como severity IN [CRITICAL, HIGH]', async () => {
    await service.findAll({ criticalOnly: true } as any);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ severity: { in: ['CRITICAL', 'HIGH'] } }),
      }),
    );
  });

  it('findAll combina intervalo de datas (from/to) em timestamp.gte/lte', async () => {
    await service.findAll({ from: '2026-01-01', to: '2026-01-31' } as any);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          timestamp: { gte: new Date('2026-01-01'), lte: new Date('2026-01-31') },
        }),
      }),
    );
  });

  it('getTimeline devolve eventos ordenados com changes parseado', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: 1, action: 'UPDATE', changes: JSON.stringify({ x: { from: 1, to: 2 } }) },
    ]);
    const out = await service.getTimeline('User', 5);
    expect(out.events[0].changes).toEqual({ x: { from: 1, to: 2 } });
  });

  it('getUserHistory combina audit logs e histórico legado em paralelo', async () => {
    const out = await service.getUserHistory(7);
    expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } }),
    );
    expect(mockPrisma.historyRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 7 } }),
    );
    expect(out).toHaveProperty('auditLogs');
    expect(out).toHaveProperty('historyRecords');
  });

  it('getStats agrega contagens, distribuição por severidade/status e top users', async () => {
    mockPrisma.auditLog.groupBy
      .mockResolvedValueOnce([{ action: 'CREATE', _count: 3 }]) // byAction
      .mockResolvedValueOnce([{ entity: 'User', _count: 2 }]) // byEntity
      .mockResolvedValueOnce([{ severity: 'HIGH', _count: 4 }]) // bySeverity
      .mockResolvedValueOnce([{ status: 'SUCCESS', _count: 9 }]) // byStatus
      .mockResolvedValueOnce([{ userId: 1, _count: 5 }]); // topUsers

    const out = await service.getStats();

    expect(out.byAction).toEqual([{ action: 'CREATE', count: 3 }]);
    expect(out.bySeverity).toEqual({ HIGH: 4 });
    expect(out.byStatus).toEqual({ SUCCESS: 9 });
  });

  it('exportLogs regista a própria exportação como evento auditável', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      {
        id: 1,
        timestamp: new Date(),
        user: { fullName: 'Ana', email: 'ana@x.com' },
        action: 'READ',
      },
    ]);

    const out = await service.exportLogs({} as any, 42);

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 42, action: 'EXPORT', entity: 'AuditLog' }),
      }),
    );
    expect(out.data[0].user).toBe('Ana (ana@x.com)');
  });

  it('exportLogs usa "Sistema" quando o log não tem utilizador associado', async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { id: 1, timestamp: new Date(), action: 'READ' },
    ]);
    const out = await service.exportLogs({} as any, 42);
    expect(out.data[0].user).toBe('Sistema (—)');
  });

  it('getAnomalySummary soma os 3 tipos de alerta no totalAlerts', async () => {
    mockPrisma.auditLog.groupBy
      .mockResolvedValueOnce([{ userId: 3, _count: 4 }])
      .mockResolvedValueOnce([{ userId: 5, _count: 3 }])
      .mockResolvedValueOnce([]);

    const out = await service.getAnomalySummary();

    expect(out.totalAlerts).toBe(2);
    expect(out.suspiciousLogins).toEqual([{ userId: 3, count: 4 }]);
  });
});

describe('AuditService — verificação de integridade da cadeia', () => {
  let service: AuditService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      auditLog: { findMany: jest.fn() },
    };
    Object.defineProperty(mockPrisma, 'read', { get: () => mockPrisma, configurable: true });
    const module: TestingModule = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<AuditService>(AuditService);
  });

  it('cadeia intacta: nenhum registo é reportado como quebrado', async () => {
    const ts1 = new Date('2026-01-01T00:00:00.000Z');
    const ts2 = new Date('2026-01-02T00:00:00.000Z');
    const hash1 = expectedHash(1, 'CREATE', 'User', 5, ts1, 'GENESIS');
    const hash2 = expectedHash(1, 'UPDATE', 'User', 5, ts2, hash1);

    mockPrisma.auditLog.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        action: 'CREATE',
        entity: 'User',
        entityId: 5,
        timestamp: ts1,
        hash: hash1,
        previousHash: 'GENESIS',
      },
      {
        id: 2,
        userId: 1,
        action: 'UPDATE',
        entity: 'User',
        entityId: 5,
        timestamp: ts2,
        hash: hash2,
        previousHash: hash1,
      },
    ]);

    const out = await service.verifyIntegrity();

    expect(out.valid).toBe(true);
    expect(out.broken).toEqual([]);
    expect(out.checked).toBe(2);
  });

  it('detecta adulteração: hash gravado não corresponde ao conteúdo (ex.: action alterada pós-facto)', async () => {
    const ts1 = new Date('2026-01-01T00:00:00.000Z');
    const realHash = expectedHash(1, 'CREATE', 'User', 5, ts1, 'GENESIS');

    mockPrisma.auditLog.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        action: 'DELETE', // adulterado depois do hash ter sido gerado para CREATE
        entity: 'User',
        entityId: 5,
        timestamp: ts1,
        hash: realHash,
        previousHash: 'GENESIS',
      },
    ]);

    const out = await service.verifyIntegrity();

    expect(out.valid).toBe(false);
    expect(out.broken).toEqual([1]);
  });

  it('detecta elo quebrado na cadeia: previousHash não corresponde ao hash anterior real', async () => {
    const ts1 = new Date('2026-01-01T00:00:00.000Z');
    const ts2 = new Date('2026-01-02T00:00:00.000Z');
    const hash1 = expectedHash(1, 'CREATE', 'User', 5, ts1, 'GENESIS');
    const hash2 = expectedHash(1, 'UPDATE', 'User', 5, ts2, 'hash-forjado');

    mockPrisma.auditLog.findMany.mockResolvedValue([
      {
        id: 1,
        userId: 1,
        action: 'CREATE',
        entity: 'User',
        entityId: 5,
        timestamp: ts1,
        hash: hash1,
        previousHash: 'GENESIS',
      },
      {
        id: 2,
        userId: 1,
        action: 'UPDATE',
        entity: 'User',
        entityId: 5,
        timestamp: ts2,
        hash: hash2,
        previousHash: 'hash-forjado',
      },
    ]);

    const out = await service.verifyIntegrity();

    expect(out.valid).toBe(false);
    expect(out.broken).toContain(2);
  });
});
