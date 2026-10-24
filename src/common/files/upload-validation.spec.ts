import { FILE_POLICIES } from './file-policies';
import { dataUrl, docx, pdf, png } from './file-fixtures';
import { inspectBuffer, inspectInlineFile } from './inspect-inline-file';
import { UploadRejectionAuditor, severityOf } from './upload-rejection.auditor';
import {
  addUploadRejectionSink,
  UploadRejectionEvent,
  uploadValidationMode,
} from './upload-validation';

const EXE = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);

describe('uploadValidationMode', () => {
  it('enforce por omissão e para qualquer valor desconhecido (falha segura)', () => {
    expect(uploadValidationMode({})).toBe('enforce');
    expect(uploadValidationMode({ UPLOAD_VALIDATION_MODE: 'enforce' })).toBe('enforce');
    expect(uploadValidationMode({ UPLOAD_VALIDATION_MODE: 'wran' })).toBe('enforce');
    expect(uploadValidationMode({ UPLOAD_VALIDATION_MODE: '' })).toBe('enforce');
  });
  it('warn só com "warn" (sem distinguir maiúsculas)', () => {
    expect(uploadValidationMode({ UPLOAD_VALIDATION_MODE: 'warn' })).toBe('warn');
    expect(uploadValidationMode({ UPLOAD_VALIDATION_MODE: ' WARN ' })).toBe('warn');
  });
});

describe('modo de validação e relatório de rejeições', () => {
  const events: UploadRejectionEvent[] = [];
  let remove: () => void;
  const prev = process.env.UPLOAD_VALIDATION_MODE;

  beforeEach(() => {
    events.length = 0;
    remove = addUploadRejectionSink(e => events.push(e));
  });
  afterEach(() => {
    remove();
    if (prev === undefined) delete process.env.UPLOAD_VALIDATION_MODE;
    else process.env.UPLOAD_VALIDATION_MODE = prev;
  });

  describe('enforce', () => {
    beforeEach(() => {
      process.env.UPLOAD_VALIDATION_MODE = 'enforce';
    });

    it('recusa e regista executável disfarçado (stage content, enforced)', () => {
      const r = inspectBuffer(EXE, 'image/png', FILE_POLICIES.AVATAR);
      expect(r.ok).toBe(false);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        policy: 'AVATAR',
        stage: 'content',
        enforced: true,
        declaredMime: 'image/png',
        bytes: EXE.length,
      });
    });

    it('ficheiro bom não gera evento', () => {
      expect(inspectBuffer(pdf(), 'application/pdf', FILE_POLICIES.PDF).ok).toBe(true);
      expect(events).toHaveLength(0);
    });
  });

  describe('warn', () => {
    beforeEach(() => {
      process.env.UPLOAD_VALIDATION_MODE = 'warn';
    });

    it('deixa passar falhas de conteúdo mas regista-as como não aplicadas', () => {
      const r = inspectBuffer(EXE, 'image/png', FILE_POLICIES.AVATAR);
      expect(r.ok).toBe(true);
      expect(events[0]).toMatchObject({ stage: 'content', enforced: false });
    });

    it('PDF com JavaScript, docx com macros e imagem do tipo errado passam e são assinalados', () => {
      expect(inspectBuffer(pdf('/JS (x)'), 'application/pdf', FILE_POLICIES.PDF).ok).toBe(true);
      const macro = docx([{ name: 'word/vbaProject.bin' }]);
      const docxMime = FILE_POLICIES.OFFICE.mimes[0];
      expect(inspectBuffer(macro, docxMime, FILE_POLICIES.OFFICE).ok).toBe(true);
      expect(inspectBuffer(png(), 'image/jpeg', FILE_POLICIES.AVATAR).ok).toBe(true);
      expect(events.map(e => e.enforced)).toEqual([false, false, false]);
    });

    it('formato, tamanho e tipo fora da política recusam SEMPRE (já eram recusados antes)', () => {
      expect(inspectBuffer(Buffer.alloc(0), 'image/png', FILE_POLICIES.AVATAR).ok).toBe(false);
      const big = Buffer.concat([png(), Buffer.alloc(FILE_POLICIES.AVATAR.maxBytes)]);
      expect(inspectBuffer(big, 'image/png', FILE_POLICIES.AVATAR).ok).toBe(false);
      expect(inspectBuffer(png(), 'image/gif', FILE_POLICIES.AVATAR).ok).toBe(false);
      expect(inspectInlineFile('data:image/png;base64,@@@', FILE_POLICIES.AVATAR).ok).toBe(false);
      expect(events.map(e => [e.stage, e.enforced])).toEqual([
        ['format', true],
        ['size', true],
        ['type', true],
        ['format', true],
      ]);
    });
  });

  it('report:false não regista (recalcular só a mensagem de erro)', () => {
    process.env.UPLOAD_VALIDATION_MODE = 'enforce';
    inspectInlineFile(dataUrl('image/png', EXE), FILE_POLICIES.AVATAR, { report: false });
    inspectInlineFile('data:image/png;base64,@@@', FILE_POLICIES.AVATAR, { report: false });
    expect(events).toHaveLength(0);
  });

  it('um sink que lança não transforma a rejeição num erro', () => {
    process.env.UPLOAD_VALIDATION_MODE = 'enforce';
    const off = addUploadRejectionSink(() => {
      throw new Error('boom');
    });
    expect(() => inspectBuffer(EXE, 'image/png', FILE_POLICIES.AVATAR)).not.toThrow();
    off();
  });
});

describe('UploadRejectionAuditor', () => {
  const base: UploadRejectionEvent = {
    policy: 'AVATAR',
    stage: 'content',
    reason: 'Ficheiro rejeitado: contém executável Windows (PE/MZ).',
    declaredMime: 'image/png',
    detectedKind: 'unknown',
    bytes: 6,
    enforced: true,
    reqId: 'req-1',
    userId: 42,
    action: 'UsersController.setMyAvatar',
  };

  it('gravação no AuditLog: DENIED/HIGH para executável recusado, sem conteúdo nem nome', () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    new UploadRejectionAuditor(audit as never).record(base);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        action: 'UPLOAD_REJECTED',
        entity: 'UploadValidation',
        status: 'DENIED',
        severity: 'HIGH',
        correlationId: 'req-1',
        metadata: expect.objectContaining({
          policy: 'AVATAR',
          endpoint: 'UsersController.setMyAvatar',
          enforced: true,
        }),
      }),
    );
    expect(JSON.stringify(audit.log.mock.calls[0][0])).not.toMatch(/fileName|contentBase64|data:/);
  });

  it('modo warn grava UPLOAD_FLAGGED/SUCCESS', () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    new UploadRejectionAuditor(audit as never).record({ ...base, enforced: false });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPLOAD_FLAGGED', status: 'SUCCESS' }),
    );
  });

  it('sem utilizador não grava; falha de auditoria não propaga', async () => {
    const audit = { log: jest.fn().mockRejectedValue(new Error('db down')) };
    const auditor = new UploadRejectionAuditor(audit as never);
    auditor.record({ ...base, userId: undefined });
    expect(audit.log).not.toHaveBeenCalled();
    expect(() => auditor.record(base)).not.toThrow();
    await Promise.resolve();
  });

  it('regista-se como sink no arranque e remove-se no fim', () => {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const auditor = new UploadRejectionAuditor(audit as never);
    auditor.onModuleInit();
    process.env.UPLOAD_VALIDATION_MODE = 'enforce';
    inspectBuffer(EXE, 'image/png', FILE_POLICIES.AVATAR);
    expect(audit.log).not.toHaveBeenCalled(); // sem userId no contexto de teste
    auditor.onModuleDestroy();
  });

  it.each([
    ['content', 'Ficheiro rejeitado: contém HTML.', 'HIGH'],
    ['content', 'O PDF contém conteúdo activo não permitido (/JS).', 'MEDIUM'],
    ['size', 'O ficheiro excede 150 KB.', 'LOW'],
    ['type', 'Tipo de ficheiro não permitido (image/gif).', 'LOW'],
    ['format', 'O ficheiro está vazio.', 'LOW'],
  ])('severidade: %s / %s -> %s', (stage, reason, severity) => {
    expect(severityOf({ ...base, stage: stage as never, reason })).toBe(severity);
  });
});
