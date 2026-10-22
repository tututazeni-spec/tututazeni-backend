import { BadRequestException } from '@nestjs/common';

/**
 * Converte um parâmetro de query obrigatório numa Date válida. Sem isto,
 * `new Date(undefined)` gera "Invalid Date" e o Prisma rebenta com 500 em vez
 * de devolver 400 ao cliente que esqueceu o parâmetro.
 */
export function parseDateQuery(value: string | undefined, name: string): Date {
  if (!value) {
    throw new BadRequestException(`O parâmetro "${name}" é obrigatório.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`O parâmetro "${name}" não é uma data válida.`);
  }
  return date;
}
