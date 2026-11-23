// src/common/helpers/iban.ts
// IBAN angolano: "AO" + 2 dígitos de controlo + 21 dígitos (o NIB). Total: 25 caracteres.
import { BadRequestException } from '@nestjs/common';

export function normalizeIban(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\s+/g, '').toUpperCase();
}

/** Verificação mod-97 (ISO 7064) sem BigInt: processa o resto por blocos. */
function mod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of rearranged) {
    const v = ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of v) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest;
}

export function isValidAngolanIban(iban: string): boolean {
  return /^AO\d{23}$/.test(iban) && mod97(iban) === 1;
}

export function assertValidAngolanIban(iban: string): void {
  if (!/^AO\d{23}$/.test(iban))
    throw new BadRequestException('IBAN inválido: use AO seguido de 23 dígitos.');
  if (mod97(iban) !== 1)
    throw new BadRequestException('IBAN inválido: os dígitos de controlo não conferem.');
}

/** NIB (21 dígitos) = IBAN sem "AO" e sem os 2 dígitos de controlo. */
export function nibFromIban(iban: string): string {
  return iban.slice(4);
}
