import {
  DEFAULT_SYSTEM_SETTINGS,
  MAX_UPLOAD_MB_CEILING,
  SystemSettings,
  checkUploadMetadata,
  clampLimit,
  isMaintenanceExempt,
  parseSystemSettings,
} from './system-settings';
import { ALLOWED_MIME_TYPES } from '../common/validators/allowed-mime-types';

const PDF = 'application/pdf';
const uploads = (over: Partial<SystemSettings['uploads']> = {}): SystemSettings['uploads'] => ({
  maxFileSizeMb: 5,
  allowedMimeTypes: [PDF],
  ...over,
});

describe('parseSystemSettings', () => {
  it.each([null, undefined, ''])('defaults para %p', raw => {
    expect(parseSystemSettings(raw)).toEqual(DEFAULT_SYSTEM_SETTINGS);
  });

  it('JSON inválido cai nos defaults', () => {
    expect(parseSystemSettings('{x')).toEqual(DEFAULT_SYSTEM_SETTINGS);
  });

  it('o modo de manutenção nasce desligado', () => {
    expect(DEFAULT_SYSTEM_SETTINGS.maintenance.enabled).toBe(false);
  });

  it('devolve cópia profunda (não contamina os defaults)', () => {
    const s = parseSystemSettings(null);
    s.uploads.allowedMimeTypes.push('x/y');
    s.maintenance.enabled = true;
    expect(DEFAULT_SYSTEM_SETTINGS.uploads.allowedMimeTypes).not.toContain('x/y');
    expect(DEFAULT_SYSTEM_SETTINGS.maintenance.enabled).toBe(false);
  });

  it('faz merge parcial por secção', () => {
    const s = parseSystemSettings(JSON.stringify({ pagination: { maxPageSize: 50 } }));
    expect(s.pagination.maxPageSize).toBe(50);
    expect(s.jobs.retentionDays).toBe(DEFAULT_SYSTEM_SETTINGS.jobs.retentionDays);
  });

  it('filtra tipos MIME fora da lista estática: a definição nunca alarga o que os DTOs aceitam', () => {
    const s = parseSystemSettings(
      JSON.stringify({ uploads: { allowedMimeTypes: [PDF, 'text/html', 'application/x-msdownload'] } }),
    );
    expect(s.uploads.allowedMimeTypes).toEqual([PDF]);
  });

  it('lista MIME vazia fica vazia (nada permitido), não volta ao default', () => {
    expect(
      parseSystemSettings(JSON.stringify({ uploads: { allowedMimeTypes: [] } })).uploads
        .allowedMimeTypes,
    ).toEqual([]);
  });

  it('por omissão permite todos os tipos da lista estática e o tamanho máximo do sistema', () => {
    expect(DEFAULT_SYSTEM_SETTINGS.uploads.allowedMimeTypes).toEqual([...ALLOWED_MIME_TYPES]);
    expect(DEFAULT_SYSTEM_SETTINGS.uploads.maxFileSizeMb).toBe(MAX_UPLOAD_MB_CEILING);
  });
});

describe('isMaintenanceExempt', () => {
  it('o ADMIN nunca é bloqueado', () => {
    expect(isMaintenanceExempt('/courses', true)).toBe(true);
  });

  it.each(['/auth/login', '/auth', '/health', '/health/ready', '/metrics', '/settings/system', '/settings/system/status'])(
    'rota %s continua acessível a qualquer um',
    url => {
      expect(isMaintenanceExempt(url, false)).toBe(true);
    },
  );

  it('ignora a query string ao comparar', () => {
    expect(isMaintenanceExempt('/auth/login?next=/courses', false)).toBe(true);
  });

  it.each(['/courses', '/users/me', '/settings', '/settings/security', '/authors', '/healthcheck', '/metrics-export'])(
    'rota %s é bloqueada (o prefixo tem de ser um segmento inteiro)',
    url => {
      expect(isMaintenanceExempt(url, false)).toBe(false);
    },
  );

  it('uma query string que imita um prefixo isento não dá acesso', () => {
    expect(isMaintenanceExempt('/courses?x=/auth/login', false)).toBe(false);
  });
});

describe('clampLimit', () => {
  it('reduz o que excede o tecto', () => {
    expect(clampLimit('5000', 200)).toBe('200');
  });

  it.each(['200', '10', '0', '-5'])('deixa %s como está', v => {
    expect(clampLimit(v, 200)).toBeNull();
  });

  it('notação científica e espaços também são reduzidos', () => {
    expect(clampLimit('1e9', 200)).toBe('200');
    expect(clampLimit(' 5000', 200)).toBe('200');
  });

  it.each(['abc', 'NaN', 'Infinity', ''])('valor não numérico %j não é alterado', v => {
    expect(clampLimit(v, 200)).toBeNull();
  });

  it('ausente ou de outro tipo → sem alteração', () => {
    expect(clampLimit(undefined, 200)).toBeNull();
    expect(clampLimit(5000, 200)).toBeNull();
  });

  // LIMITAÇÃO CONHECIDA: ?limit=1&limit=5000 chega como array e passa sem ser reduzido.
  // O handler que o converter com Number() obtém NaN, por isso é inofensivo hoje,
  // mas o tecto não é garantido pelo interceptor nesse caso.
  it('?limit repetido (array) não é reduzido', () => {
    expect(clampLimit(['1', '5000'], 200)).toBeNull();
  });
});

describe('checkUploadMetadata', () => {
  it.each([null, undefined, 'texto', 42])('corpo %p não é validado', body => {
    expect(checkUploadMetadata(body, uploads())).toBeNull();
  });

  it('aceita tipo permitido dentro do tamanho', () => {
    expect(checkUploadMetadata({ mimeType: PDF, fileSize: 1024 }, uploads())).toBeNull();
  });

  it('recusa tipo fora da lista, com o tipo na mensagem', () => {
    expect(checkUploadMetadata({ mimeType: 'text/html' }, uploads())).toBe(
      'Tipo de ficheiro não permitido: text/html',
    );
  });

  it('a comparação do tipo é exacta (não aceita variações de maiúsculas nem parâmetros)', () => {
    expect(checkUploadMetadata({ mimeType: 'APPLICATION/PDF' }, uploads())).not.toBeNull();
    expect(checkUploadMetadata({ mimeType: `${PDF}; charset=x` }, uploads())).not.toBeNull();
  });

  it('recusa fileSize acima do máximo em bytes', () => {
    const max = 5 * 1024 * 1024;
    expect(checkUploadMetadata({ fileSize: max }, uploads())).toBeNull();
    expect(checkUploadMetadata({ fileSize: max + 1 }, uploads())).toMatch(/máximo de 5 MB/);
  });

  it('fileSizeKb é convertido para bytes', () => {
    expect(checkUploadMetadata({ fileSizeKb: 5 * 1024 }, uploads())).toBeNull();
    expect(checkUploadMetadata({ fileSizeKb: 5 * 1024 + 1 }, uploads())).not.toBeNull();
  });

  it('tamanho como string não é considerado (só números)', () => {
    expect(checkUploadMetadata({ fileSize: '999999999999' }, uploads())).toBeNull();
  });

  it('lista vazia de tipos permitidos recusa qualquer tipo declarado', () => {
    expect(checkUploadMetadata({ mimeType: PDF }, uploads({ allowedMimeTypes: [] }))).not.toBeNull();
  });

  // LIMITAÇÃO CONHECIDA: só olha para os campos mimeType/fileSize/fileSizeKb.
  // Um corpo com outro nome para o mesmo dado (contentType, size…) não é verificado aqui.
  it('só valida os campos mimeType, fileSize e fileSizeKb', () => {
    expect(checkUploadMetadata({ contentType: 'text/html', size: 9e12 }, uploads())).toBeNull();
  });
});
