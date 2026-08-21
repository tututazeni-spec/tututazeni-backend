// src/common/helpers/pagination.helper.ts
// Helpers partilhados para paginação — substituem a lógica skip/take/totalPages
// duplicada em dezenas de serviços. Agnósticos do cliente Prisma usado
// (this.prisma, this.prisma.read, etc.) — recebem apenas valores já calculados.

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/**
 * Calcula `skip`/`take` a partir de `page`/`limit` para usar directamente
 * num `findMany` do Prisma.
 *
 * Ex.: const { skip, take } = calculatePagination(page, limit);
 */
export function calculatePagination(page = 1, limit = 20): { skip: number; take: number } {
  return {
    skip: (page - 1) * limit,
    take: limit,
  };
}

/**
 * Constrói a resposta paginada padrão `{ data, meta }` a partir dos
 * resultados já obtidos (findMany + count).
 *
 * Ex.: return buildPaginatedResponse(data, total, page, limit);
 */
export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page = 1,
  limit = 20,
): PaginatedResponse<T> {
  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}
