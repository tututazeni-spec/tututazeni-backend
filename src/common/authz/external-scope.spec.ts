import { NotFoundException } from '@nestjs/common';
import {
  applyOwnLiveClassScope,
  assertCanManageCourse,
  assertOwnLiveClass,
  ensureOwnInstructorProfile,
  isExternalInstructor,
  ownInstructorProfileId,
} from './external-scope';

const EXT = {
  id: 9,
  fullName: 'Ana Externa',
  email: 'ana@x.com',
  role: { name: 'INSTRUCTOR_EXTERNO' },
};
const ADMIN = { id: 1, role: { name: 'ADMIN' } };

function prismaMock() {
  return {
    trainingInstructorProfile: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    liveClass: { findFirst: jest.fn() },
    course: { findFirst: jest.fn() },
  };
}

describe('isExternalInstructor', () => {
  it('só para o papel INSTRUCTOR_EXTERNO', () => {
    expect(isExternalInstructor(EXT)).toBe(true);
    expect(isExternalInstructor(ADMIN)).toBe(false);
    expect(isExternalInstructor({ role: null })).toBe(false);
    expect(isExternalInstructor({})).toBe(false);
  });
});

describe('ownInstructorProfileId', () => {
  it('externo com perfil → id do perfil', async () => {
    const p = prismaMock();
    p.trainingInstructorProfile.findUnique.mockResolvedValue({ id: 5 });
    expect(await ownInstructorProfileId(p as never, EXT)).toBe(5);
    expect(p.trainingInstructorProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 9 } }),
    );
  });
  it('externo sem perfil → null', async () => {
    const p = prismaMock();
    p.trainingInstructorProfile.findUnique.mockResolvedValue(null);
    expect(await ownInstructorProfileId(p as never, EXT)).toBeNull();
  });
  it('quem não é externo → null e nem consulta a BD', async () => {
    const p = prismaMock();
    expect(await ownInstructorProfileId(p as never, ADMIN)).toBeNull();
    expect(p.trainingInstructorProfile.findUnique).not.toHaveBeenCalled();
  });
});

describe('ensureOwnInstructorProfile', () => {
  it('reaproveita o perfil existente', async () => {
    const p = prismaMock();
    p.trainingInstructorProfile.findUnique.mockResolvedValue({ id: 5 });
    expect(await ensureOwnInstructorProfile(p as never, EXT)).toBe(5);
    expect(p.trainingInstructorProfile.create).not.toHaveBeenCalled();
  });
  it('cria um perfil EXTERNAL ligado ao utilizador quando falta', async () => {
    const p = prismaMock();
    p.trainingInstructorProfile.findUnique.mockResolvedValue(null);
    p.trainingInstructorProfile.create.mockResolvedValue({ id: 6 });
    expect(await ensureOwnInstructorProfile(p as never, EXT)).toBe(6);
    expect(p.trainingInstructorProfile.create.mock.calls[0][0].data).toMatchObject({
      type: 'EXTERNAL',
      userId: 9,
      name: 'Ana Externa',
      email: 'ana@x.com',
    });
  });
  it('se outro pedido criou o perfil entretanto (P2002), relê-o', async () => {
    const p = prismaMock();
    p.trainingInstructorProfile.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 7 });
    p.trainingInstructorProfile.create.mockRejectedValue({ code: 'P2002' });
    expect(await ensureOwnInstructorProfile(p as never, EXT)).toBe(7);
  });
});

describe('applyOwnLiveClassScope', () => {
  it('acrescenta (sem apagar) a condição "sou instrutor ou co-instrutor"', () => {
    const where = applyOwnLiveClassScope({ status: 'SCHEDULED', AND: [{ title: 'x' }] }, 5);
    expect(where).toEqual({
      status: 'SCHEDULED',
      AND: [{ title: 'x' }, { OR: [{ instructorId: 5 }, { coInstructorId: 5 }] }],
    });
  });
  it('sem perfil não casa com nada', () => {
    expect(applyOwnLiveClassScope({}, null)).toEqual({ AND: [{ id: { in: [] } }] });
  });
  it('descarta um instructorId vindo do cliente', () => {
    const where = applyOwnLiveClassScope({ instructorId: 99 }, 5);
    expect(where.instructorId).toBeUndefined();
  });
});

describe('assertOwnLiveClass', () => {
  it('aula própria passa', async () => {
    const p = prismaMock();
    p.trainingInstructorProfile.findUnique.mockResolvedValue({ id: 5 });
    p.liveClass.findFirst.mockResolvedValue({ id: 10 });
    await expect(assertOwnLiveClass(p as never, EXT, 10)).resolves.toBeUndefined();
    expect(p.liveClass.findFirst.mock.calls[0][0].where).toEqual({
      id: 10,
      OR: [{ instructorId: 5 }, { coInstructorId: 5 }],
    });
  });
  it('aula alheia → 404', async () => {
    const p = prismaMock();
    p.trainingInstructorProfile.findUnique.mockResolvedValue({ id: 5 });
    p.liveClass.findFirst.mockResolvedValue(null);
    await expect(assertOwnLiveClass(p as never, EXT, 11)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('externo sem perfil → 404 sem consultar aulas', async () => {
    const p = prismaMock();
    p.trainingInstructorProfile.findUnique.mockResolvedValue(null);
    await expect(assertOwnLiveClass(p as never, EXT, 10)).rejects.toBeInstanceOf(NotFoundException);
    expect(p.liveClass.findFirst).not.toHaveBeenCalled();
  });
  it('quem não é externo: não faz nada', async () => {
    const p = prismaMock();
    await expect(assertOwnLiveClass(p as never, ADMIN, 10)).resolves.toBeUndefined();
    expect(p.liveClass.findFirst).not.toHaveBeenCalled();
  });
});

describe('assertCanManageCourse', () => {
  it('instrutor principal ou co-instrutor do curso passa', async () => {
    const p = prismaMock();
    p.course.findFirst.mockResolvedValue({ id: 3 });
    await expect(assertCanManageCourse(p as never, EXT, 3)).resolves.toBeUndefined();
    expect(p.course.findFirst.mock.calls[0][0].where).toEqual({
      id: 3,
      OR: [{ primaryInstructorId: 9 }, { instructors: { some: { userId: 9 } } }],
    });
  });
  it('curso onde não é instrutor → 404', async () => {
    const p = prismaMock();
    p.course.findFirst.mockResolvedValue(null);
    await expect(assertCanManageCourse(p as never, EXT, 4)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('quem não é externo: não faz nada', async () => {
    const p = prismaMock();
    await expect(assertCanManageCourse(p as never, ADMIN, 4)).resolves.toBeUndefined();
    expect(p.course.findFirst).not.toHaveBeenCalled();
  });
});
