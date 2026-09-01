// src/common/transformers/empty-string-to-undefined.ts
// Converte strings vazias (ou só com espaços) recebidas no body para `undefined`
// ANTES de qualquer validação class-validator correr.
//
// Porquê: formulários e ficheiros de importação enviam campos opcionais não
// preenchidos como `""`, não os omitem. Para um campo `@IsOptional()` isso
// não falha a validação (`""` é uma string válida), por isso o `""` chega ao
// serviço e é escrito na BD. Num campo `String? @unique` (ex.: `User.employeeNumber`)
// o primeiro registo com `""` grava, o segundo rebenta com P2002 (500) — ver
// memory project-innova-* sobre criação de utilizadores / bulk-import.
//
// `@IsOptional()` só ignora `null`/`undefined`; ao normalizar `""` -> `undefined`
// aqui, o campo passa a comportar-se como genuinamente ausente em toda a cadeia.

import { Transform } from 'class-transformer';

export function EmptyStringToUndefined(): PropertyDecorator {
  return Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );
}
