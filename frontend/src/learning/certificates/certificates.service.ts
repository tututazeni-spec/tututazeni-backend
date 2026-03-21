import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { randomUUID } from 'crypto';
import { CertificateType } from '@prisma/client';

@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  async issueForCourse(enrollmentId: number) {
    return this.prisma.certificate.create({
      data: {
        type: CertificateType.COURSE,
        enrollmentId,
        validationCode: randomUUID(),
      },
    });
  }

  async issueForLeadership(programId: number) {
    return this.prisma.certificate.create({
      data: {
        type: CertificateType.LEADERSHIP,
        programId,
        validationCode: randomUUID(),
      },
    });
  }

  async issueForDevelopment(developmentPlanId: number) {
    return this.prisma.certificate.create({
      data: {
        type: CertificateType.DEVELOPMENT,
        developmentPlanId,
        validationCode: randomUUID(),
      },
    });
  }

  findAll() {
    return this.prisma.certificate.findMany({
      include: {
        enrollment: true,
        program: true,
        developmentPlan: true,
      },
    });
  }

  validate(code: string) {
    return this.prisma.certificate.findUnique({
      where: { validationCode: code },
    });
  }

  revoke(id: number) {
    return this.prisma.certificate.update({
      where: { id },
      data: { revoked: true },
    });
  }
}
