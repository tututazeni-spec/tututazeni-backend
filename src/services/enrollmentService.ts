import prisma from "../lib/prisma";
import { EnrollmentStatus, Prisma } from "@prisma/client";

export type Enrollment = {
  id: number;
  userId: number;
  courseId: number;
  status: EnrollmentStatus;
  createdAt: Date;
};

// Buscar todos os enrollments
export async function getEnrollments(): Promise<Enrollment[]> {
  const enrollments = await prisma.enrollment.findMany();

  return enrollments.map((e) => ({
    id: e.id,
    userId: e.userId,
    courseId: e.courseId,
    status: e.status,
    createdAt: e.enrolledAt,
  }));
}

// Buscar enrollment por ID
export async function getEnrollmentById(id: number): Promise<Enrollment | null> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id },
  });

  if (!enrollment) return null;

  return {
    id: enrollment.id,
    userId: enrollment.userId,
    courseId: enrollment.courseId,
    status: enrollment.status,
    createdAt: enrollment.enrolledAt,
  };
}

// Criar enrollment
export async function createEnrollment(
  userId: number,
  courseId: number,
  status: EnrollmentStatus
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
    status: enrollment.status,
    createdAt: enrollment.enrolledAt,
  };
}

// Atualizar enrollment
export async function updateEnrollment(
  id: number,
  data: Prisma.EnrollmentUpdateInput
): Promise<Enrollment> {
  const enrollment = await prisma.enrollment.update({
    where: { id },
    data,
  });

  return {
    id: enrollment.id,
    userId: enrollment.userId,
    courseId: enrollment.courseId,
    status: enrollment.status,
    createdAt: enrollment.enrolledAt,
  };
}

// Deletar enrollment
export async function deleteEnrollment(id: number): Promise<void> {
  await prisma.enrollment.delete({
    where: { id },
  });
}

