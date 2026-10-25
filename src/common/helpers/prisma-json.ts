import type { Prisma } from '@prisma/client';

/**
 * Converte um valor estruturado (DTO, objecto de domínio) no tipo aceite pelas
 * colunas `Json` do Prisma. As classes/interfaces de domínio não têm index
 * signature, por isso o compilador não as aceita como `InputJsonValue`; o
 * cast fica confinado aqui em vez de `as unknown as` espalhado pelos serviços.
 */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/** Igual a `toJson`, para colunas `Json` que aceitam apenas objectos. */
export function toJsonObject(value: unknown): Prisma.InputJsonObject {
  return value as Prisma.InputJsonObject;
}

/**
 * Lê uma coluna `Json` com a forma conhecida pelo chamador. O Prisma devolve
 * `JsonValue`; o contrato da forma é garantido por quem escreve a coluna.
 */
export function fromJson<T>(value: unknown): T {
  return value as T;
}
