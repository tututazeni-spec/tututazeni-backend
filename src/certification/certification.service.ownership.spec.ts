import { NotFoundException } from '@nestjs/common';
import { assertCanAccess } from '../common/authz/ownership';
import { Role } from '../auth/enums/role.enum';

// Testa a lógica de ownership directamente — isola a função pura dos detalhes do serviço
const mockCert = {
  id: 'cert-abc',
  userId: 10,
  code: 'CERT-00001',
  pdfUrl: '/pdf/cert-abc.pdf',
  publicUrl: '/pub/cert-abc',
  title: 'Certificado Curso X',
  deletedAt: null,
};

const owner = { id: 10, role: { name: 'COLABORADOR' } };
const otherUser = { id: 99, role: { name: 'COLABORADOR' } };
const adminUser = { id: 1, role: { name: 'ADMIN' } };
const rhUser = { id: 2, role: { name: 'RH' } };

describe('assertCanAccess — regras de ownership de certificados', () => {
  const privileged = [Role.ADMIN, Role.RH];

  it('dono do certificado passa sem excepção', () => {
    expect(() => assertCanAccess(mockCert, mockCert.userId, owner, privileged)).not.toThrow();
  });

  it('utilizador diferente lança NotFoundException', () => {
    expect(() => assertCanAccess(mockCert, mockCert.userId, otherUser, privileged)).toThrow(
      NotFoundException,
    );
  });

  it('ADMIN passa independentemente do userId', () => {
    expect(() => assertCanAccess(mockCert, mockCert.userId, adminUser, privileged)).not.toThrow();
  });

  it('RH passa independentemente do userId', () => {
    expect(() => assertCanAccess(mockCert, mockCert.userId, rhUser, privileged)).not.toThrow();
  });

  it('recurso null lança NotFoundException (cert não encontrado)', () => {
    expect(() => assertCanAccess(null, 10, owner, privileged)).toThrow(NotFoundException);
  });
});
