import { BadRequestException } from '@nestjs/common';
import { CertificatesExportService, MAX_EXPORT_ROWS } from './certificates-export.service';

describe('CertificatesExportService', () => {
  const admin = { exportRows: jest.fn() };
  const scopeSvc = { resolveScope: jest.fn() };
  const audit = { log: jest.fn() };
  const svc = new CertificatesExportService(admin as never, scopeSvc as never, audit as never);
  const actor = { id: 9, role: { name: 'RH' } };

  const row = (id: number, over: Record<string, unknown> = {}) => ({
    id,
    holderName: `Titular ${id}`,
    departmentName: 'RH',
    title: 'Segurança',
    activityKind: 'COURSE',
    origin: 'INTERNAL',
    status: 'ACTIVE',
    code: `CODE${id}`,
    issuedAt: new Date('2026-10-01T00:00:00Z'),
    expiresAt: null,
    hours: 8,
    ...over,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    scopeSvc.resolveScope.mockResolvedValue({ kind: 'ALL' });
    admin.exportRows.mockResolvedValue([row(1), row(2)]);
  });

  it('CSV: BOM, cabeçalho em português e uma linha por certificado', async () => {
    const r = await svc.exportCertificates({ format: 'csv' }, actor);
    const text = r.buffer.toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trim().split('\n');
    expect(lines[0]).toBe(
      'Titular,Departamento,Formação,Tipo,Origem,Estado,Emissão,Validade,Código',
    );
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('Válido');
    expect(r).toMatchObject({ contentType: 'text/csv; charset=utf-8', rows: 2 });
    expect(r.filename).toMatch(/^certificados-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('CSV neutraliza fórmulas no nome da formação', async () => {
    admin.exportRows.mockResolvedValue([row(1, { title: '=HYPERLINK("http://x")' })]);
    const r = await svc.exportCertificates({ format: 'csv' }, actor);
    expect(r.buffer.toString('utf8')).toContain(`'=HYPERLINK`);
  });

  it('XLSX devolve um ficheiro zip válido com o tipo certo', async () => {
    const r = await svc.exportCertificates({ format: 'xlsx' }, actor);
    expect(r.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(r.contentType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(r.filename.endsWith('.xlsx')).toBe(true);
  });

  it('PDF devolve um PDF', async () => {
    const r = await svc.exportCertificates({ format: 'pdf' }, actor);
    expect(r.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(r.contentType).toBe('application/pdf');
  });

  it('PDF com centenas de linhas e texto longo não rebenta', async () => {
    admin.exportRows.mockResolvedValue(
      Array.from({ length: 300 }, (_, i) => row(i + 1, { title: 'Formação '.repeat(40) })),
    );
    const r = await svc.exportCertificates({ format: 'pdf' }, actor);
    expect(r.buffer.length).toBeGreaterThan(5000);
  });

  it('formato por omissão é CSV', async () => {
    const r = await svc.exportCertificates({}, actor);
    expect(r.filename.endsWith('.csv')).toBe(true);
  });

  it('mais do que o máximo → 400, sem ficheiro nem auditoria', async () => {
    admin.exportRows.mockResolvedValue(
      Array.from({ length: MAX_EXPORT_ROWS + 1 }, (_, i) => row(i + 1)),
    );
    await expect(svc.exportCertificates({ format: 'csv' }, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('passa o âmbito do actor para a consulta', async () => {
    scopeSvc.resolveScope.mockResolvedValue({ kind: 'TEAM', userIds: [4] });
    await svc.exportCertificates({ format: 'csv' }, { id: 7, role: { name: 'GESTOR' } });
    expect(admin.exportRows).toHaveBeenCalledWith(
      expect.anything(),
      { kind: 'TEAM', userIds: [4] },
      expect.anything(),
      MAX_EXPORT_ROWS + 1,
    );
  });

  it('audita uma só vez com formato, contagem e filtros — sem o texto da pesquisa nem códigos', async () => {
    await svc.exportCertificates(
      { format: 'xlsx', search: 'Maria Silva', code: 'ABCD1234', status: 'ACTIVE', courseId: 3 },
      actor,
    );
    expect(audit.log).toHaveBeenCalledTimes(1);
    const call = audit.log.mock.calls[0][0];
    expect(call).toMatchObject({
      action: 'CERTIFICATE_EXPORTED',
      entity: 'Certificate',
      userId: 9,
      strict: true,
    });
    expect(call.metadata).toMatchObject({
      format: 'xlsx',
      rows: 2,
      filters: { status: 'ACTIVE', courseId: 3, hasSearch: true, hasCode: true },
    });
    const text = JSON.stringify(call.metadata);
    expect(text).not.toContain('Maria Silva');
    expect(text).not.toContain('ABCD1234');
  });
});
