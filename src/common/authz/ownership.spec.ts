// src/common/authz/ownership.spec.ts
import { NotFoundException } from '@nestjs/common';
import { isPrivileged, assertCanAccess, ownershipWhere } from './ownership';
import { Role } from '../../auth/enums/role.enum';

const employee = { id: 7, role: { name: 'COLABORADOR' } };
const admin = { id: 1, role: { name: 'ADMIN' } };
const noRole = { id: 9, role: null };

describe('isPrivileged', () => {
  it('true quando o papel está na lista', () => {
    expect(isPrivileged(admin, [Role.ADMIN, Role.RH])).toBe(true);
  });
  it('false quando o papel não está na lista', () => {
    expect(isPrivileged(employee, [Role.ADMIN, Role.RH])).toBe(false);
  });
  it('false quando não há papel', () => {
    expect(isPrivileged(noRole, [Role.ADMIN])).toBe(false);
  });
});

describe('assertCanAccess', () => {
  it('lança 404 quando o recurso é null', () => {
    expect(() => assertCanAccess(null, 7, employee, [Role.ADMIN])).toThrow(NotFoundException);
  });
  it('passa quando o utilizador é o dono (id numérico)', () => {
    expect(() => assertCanAccess({ x: 1 }, 7, employee, [Role.ADMIN])).not.toThrow();
  });
  it('passa quando o dono é string equivalente ao id numérico', () => {
    expect(() => assertCanAccess({ x: 1 }, '7', employee, [Role.ADMIN])).not.toThrow();
  });
  it('passa quando não é dono mas tem papel privilegiado', () => {
    expect(() => assertCanAccess({ x: 1 }, 99, admin, [Role.ADMIN, Role.RH])).not.toThrow();
  });
  it('lança 404 quando não é dono nem privilegiado', () => {
    expect(() => assertCanAccess({ x: 1 }, 99, employee, [Role.ADMIN, Role.RH])).toThrow(
      NotFoundException,
    );
  });
});

describe('ownershipWhere', () => {
  it('devolve {} para papel privilegiado', () => {
    expect(ownershipWhere(admin, 'userId', [Role.ADMIN, Role.RH])).toEqual({});
  });
  it('força o dono para papel não privilegiado', () => {
    expect(ownershipWhere(employee, 'userId', [Role.ADMIN, Role.RH])).toEqual({ userId: 7 });
  });
});
