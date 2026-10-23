// src/common/files/sanitize-file-name.ts
// Nomes de ficheiro vêm do cliente e acabam em Content-Disposition, listagens e exports.
// `fileNameProblem` rejeita nomes perigosos (usado nos DTOs); `sanitizeFileName` produz um
// nome seguro para persistir/devolver quando o nome original já passou pela validação ou é legado.
import { registerDecorator, ValidationOptions } from 'class-validator';
import { MAX_FILE_NAME_LENGTH } from '../validators/allowed-mime-types';

/** Extensões executáveis, de script, activas no browser ou com macros. */
export const BLOCKED_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe', 'dll', 'bat', 'cmd', 'scr', 'msi', 'msp', 'pif', 'cpl', 'gadget',
  'js', 'jse', 'mjs', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1', 'sh', 'bash', 'zsh',
  'jar', 'apk', 'hta', 'lnk', 'reg', 'iso', 'dmg',
  'html', 'htm', 'xhtml', 'shtml', 'svg', 'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi',
  'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam', 'ppsm',
]); // prettier-ignore

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
// Bidi override (U+202A a U+202E, U+2066 a U+2069): inverte a ordem visual da extensao.
const BIDI_CHARS = /[\u202a-\u202e\u2066-\u2069\u200e\u200f]/;
const FORBIDDEN_CHARS = /[/\\:*?"<>|]/;

/** Todas as extensões do nome (`a.pdf.exe` → ['pdf', 'exe']), em minúsculas. */
function extensionsOf(name: string): string[] {
  return name.split('.').slice(1).map(e => e.trim().toLowerCase()); // prettier-ignore
}

/** `null` se o nome é aceitável; caso contrário o motivo. */
export function fileNameProblem(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return 'o nome do ficheiro é obrigatório';
  if (value.length > MAX_FILE_NAME_LENGTH) {
    return `o nome do ficheiro excede ${MAX_FILE_NAME_LENGTH} caracteres`;
  }
  if (CONTROL_CHARS.test(value)) return 'o nome do ficheiro contém caracteres de controlo';
  if (BIDI_CHARS.test(value)) return 'o nome do ficheiro contém caracteres de direção de texto';
  if (value.includes('..')) return 'o nome do ficheiro não pode conter ".."';
  if (FORBIDDEN_CHARS.test(value)) {
    return 'o nome do ficheiro não pode conter / \\ : * ? " < > |';
  }
  if (value !== value.trim() || value.endsWith('.')) {
    return 'o nome do ficheiro não pode começar/terminar com espaços ou terminar em ponto';
  }
  if (WINDOWS_RESERVED.test(value.split('.')[0].trim())) {
    return 'o nome do ficheiro é reservado pelo sistema';
  }
  const blocked = extensionsOf(value).find(e => BLOCKED_EXTENSIONS.has(e));
  if (blocked) return `extensão de ficheiro não permitida (.${blocked})`;
  return null;
}

/**
 * Reescreve um nome para uma forma segura (nunca lança). Usar ao persistir nomes de origem não
 * validada ou ao compor `Content-Disposition`. Se não sobrar nada, devolve `fallback`.
 */
export function sanitizeFileName(value: unknown, fallback = 'ficheiro'): string {
  if (typeof value !== 'string') return fallback;
  let name = value.normalize('NFC');
  name = name.split(/[/\\]/).pop() ?? ''; // basename dos dois estilos de separador
  name = name
    .replace(new RegExp(CONTROL_CHARS.source, 'g'), '')
    .replace(new RegExp(BIDI_CHARS.source, 'g'), '')
    .replace(/[:*?"<>|]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
    .replace(/[. ]+$/, '');
  if (name.length > MAX_FILE_NAME_LENGTH) {
    const dot = name.lastIndexOf('.');
    const ext = dot > 0 && name.length - dot <= 16 ? name.slice(dot) : '';
    name = name.slice(0, MAX_FILE_NAME_LENGTH - ext.length) + ext;
  }
  if (!name || name.startsWith('.')) name = name.replace(/^\.+/, '');
  if (!name) return fallback;
  if (WINDOWS_RESERVED.test(name.split('.')[0])) name = `_${name}`;
  return name;
}

export function IsSafeFileName(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSafeFileName',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => fileNameProblem(value) === null,
        defaultMessage: args => `${args?.property}: ${fileNameProblem(args?.value) ?? 'inválido'}`,
      },
    });
  };
}
