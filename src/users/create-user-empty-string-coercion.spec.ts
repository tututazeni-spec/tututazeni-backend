// src/users/create-user-empty-string-coercion.spec.ts
// Regressão: criar utilizador (POST /users) e bulk-import (POST /users/bulk-import)
// rebentavam com 500 quando um campo opcional era enviado como "" pelo
// formulário / ficheiro de importação.
//
// Root cause: `User.employeeNumber` é `String? @unique`. `@IsOptional()` aceita
// "" (string válida), o serviço grava "", e o 2.º utilizador sem nº de
// funcionário colide na unique constraint -> Prisma P2002 -> 500 (não há filtro
// de excepções Prisma; cai no genérico "Internal server error").
//
// Fix: `@EmptyStringToUndefined()` nas DTOs normaliza "" (e só-espaços) para
// `undefined` antes da validação, para o campo se comportar como ausente.
//
// Replica o transformOptions real de main.ts via plainToInstance (mesma técnica
// do boolean-query-filter-coercion.spec.ts) — não sobe a app, mas exercita o
// mesmo mecanismo do class-transformer.

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateUserDto } from './users.dto';

const TRANSFORM_OPTIONS = { enableImplicitConversion: true };

const toDto = (plain: Record<string, unknown>) =>
  plainToInstance(CreateUserDto, plain, TRANSFORM_OPTIONS) as unknown as Record<string, unknown>;

describe('CreateUserDto — normalização de strings vazias', () => {
  const BASE = { fullName: 'Manuel Afonso Neto', email: 'manuel@innova.ao' };

  it.each([
    'employeeNumber',
    'phone',
    'birthDate',
    'gender',
    'avatarUrl',
    'language',
    'timezone',
    'country',
    'city',
    'hireDate',
    'exitDate',
    'hrStatus',
    'accountStatus',
  ])('%s: "" e "   " tornam-se undefined', field => {
    expect(toDto({ ...BASE, [field]: '' })[field]).toBeUndefined();
    expect(toDto({ ...BASE, [field]: '   ' })[field]).toBeUndefined();
  });

  it('um employeeNumber real passa intacto', () => {
    expect(toDto({ ...BASE, employeeNumber: 'EMP-001' }).employeeNumber).toBe('EMP-001');
  });

  it('payload só com campos obrigatórios + "" opcionais é válido (sem erros de validação)', () => {
    const dto = plainToInstance(
      CreateUserDto,
      { ...BASE, employeeNumber: '', phone: '', birthDate: '', gender: '', hireDate: '' },
      TRANSFORM_OPTIONS,
    );
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('bulk-import: várias linhas sem nº de funcionário não produzem "" repetido', () => {
    const rows = [
      { ...BASE, email: 'a@innova.ao', employeeNumber: '' },
      { ...BASE, email: 'b@innova.ao', employeeNumber: '' },
      { ...BASE, email: 'c@innova.ao', employeeNumber: '' },
    ];
    const dtos = rows.map(r => toDto(r));
    expect(dtos.every(d => d.employeeNumber === undefined)).toBe(true);
  });
});
