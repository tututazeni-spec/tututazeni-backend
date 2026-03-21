import prisma from "../lib/prisma";
import { EnrollmentStatus, Prisma } from "@prisma/client";

// Tipo de retorno alinhado com Prisma
export type Enrollment = {
  id: number;
  userId: number;
  courseId: number;
  status: string; // ou enum que você usa no Prisma
  createdAt: Date;
};

// Buscar todos os enrollments
export async function getEnrollments(): Promise<Enrollment[]> {
  const enrollments = await prisma.enrollment.findMany();
  return enrollments.map(e => ({
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
    where: { id }, // id como number
  });

  if (!enrollment) return null;

  return {
    id: enrollment.id,
    userId: enrollment.userId,
    courseId: enrollment.courseId,
    status: enrollment.status,
    createdAt: enrollment.enrolledAt
  };
}

// Criar um enrollment
export async function createEnrollment(
  userId: number,
  courseId: number,
  status: EnrollmentStatus
) {
  const enrollment = await prisma.enrollment.create({
    data: {
      userId,
      courseId,
      status
    }
  });

  return {
    id: enrollment.id,
    userId: enrollment.userId,
    courseId: enrollment.courseId,
    status: enrollment.status,
    createdAt: enrollment.enrolledAt
  };
}

// Atualizar enrollment
export async function updateEnrollment(
  id: number,
  data: Prisma.EnrollmentUpdateInput
) {
  const enrollment = await prisma.enrollment.update({
    where: { id },
    data
  });

  return {
    id: enrollment.id,
    userId: enrollment.userId,
    courseId: enrollment.courseId,
    status: enrollment.status,
    createdAt: enrollment.enrolledAt
  };
}

// Deletar enrollment
export async function deleteEnrollment(id: number): Promise<void> {
  await prisma.enrollment.delete({
    where: { id },
  });
}