import prisma from "../lib/prisma";

// Definido localmente para não depender do generate em tempo de build
export type EnrollmentStatus = "EM_ANDAMENTO" | "CONCLUIDO" | "CANCELADO";

export type Enrollment = {
  id: number;
  userId: number;
  courseId: number;
  status: EnrollmentStatus;
  createdAt: Date;
};

export type UpdateEnrollmentInput = {
  status?: EnrollmentStatus;
  userId?: number;
  courseId?: number;
};

// Buscar todos os enrollments
export async function getEnrollments(): Promise<Enrollment[]> {
  const enrollments = await prisma.enrollment.findMany();

  return enrollments.map((e) => ({
    id: e.id,
    userId: e.userId,
    courseId: e.courseId,
    status: e.status as EnrollmentStatus,
    createdAt: e.enrolledAt,
  }));
}

// Buscar enrollment por ID
export async function getEnrollmentById(
  id: number
): Promise<Enrollment | null> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
  });

  if (!enrollment) return null;

  return {
    id: enrollment.id,
    userId: enrollment.userId,
    courseId: enrollment.courseId,
    status: enrollment.status as EnrollmentStatus,
    createdAt: enrollment.enrolledAt,
  };
}

// Criar enrollment
export async function createEnrollment(
  userId: number,
  courseId: number,
  status: EnrollmentStatus = "EM_ANDAMENTO"
): Promise<Enrollment> {
  const enrollment = await prisma.enrollment.create({
    data: {
      userId,
      courseId,
      status,
    },
  });

  return {
    id: enrollment.id,
    userId: enrollment.userId,
    courseId: enrollment.courseId,
    status: enrollment.status as EnrollmentStatus,
    createdAt: enrollment.enrolledAt,
  };
}

// Actualizar enrollment
export async function updateEnrollment(
  id: number,
  data: UpdateEnrollmentInput
): Promise<Enrollment> {
  const enrollment = await prisma.enrollment.update({
    where: { id },
    data,
  });

  return {
    id: enrollment.id,
    userId: enrollment.userId,
    courseId: enrollment.courseId,
    status: enrollment.status as EnrollmentStatus,
    createdAt: enrollment.enrolledAt,
  };
}

// Eliminar enrollment
export async function deleteEnrollment(id: number): Promise<void> {
  await prisma.enrollment.delete({
    where: { id },
  });
}