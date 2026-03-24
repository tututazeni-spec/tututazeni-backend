import { PrismaClient } from "@prisma/client";

// Evita criar múltiplas instâncias no desenvolvimento (hot reload do Node/Next.js)
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["query"], // opcional: loga queries no console
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
