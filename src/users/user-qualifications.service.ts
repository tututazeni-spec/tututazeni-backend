import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { assertCanAccess } from '../common/authz/ownership';
import { CurrentUserData } from '../common/types/current-user';
import { ExternalCertificationDto, LanguageDto, QualificationDto } from './user-qualifications.dto';

import { ADMIN_RH_ROLES } from '../auth/enums/role-groups';

const PRIVILEGED = ADMIN_RH_ROLES;

@Injectable()
export class UserQualificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Pedido ao perfil de `userId`: só o próprio ou ADMIN/RH.
  private guardUser(userId: number, user: CurrentUserData): void {
    assertCanAccess(true, userId, user, PRIVILEGED);
  }

  // O item tem de pertencer ao `userId` do URL *e* o chamador de poder aceder a
  // esse perfil — impede apagar o item de B pedindo /users/A/qualifications/<id de B>.
  private guardItem<T extends { userId: number }>(
    item: T | null,
    userId: number,
    user: CurrentUserData,
  ): T {
    assertCanAccess(item, userId, user, PRIVILEGED);
    if (item.userId !== userId) throw new NotFoundException('Recurso não encontrado');
    return item;
  }

  async getProfile(userId: number, user: CurrentUserData) {
    this.guardUser(userId, user);
    const [qualifications, languages, certifications, owner] = await Promise.all([
      this.prisma.read.userQualification.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
      this.prisma.read.userLanguage.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
      this.prisma.read.userExternalCertification.findMany({
        where: { userId },
        orderBy: { id: 'asc' },
      }),
      this.prisma.read.user.findUnique({
        where: { id: userId },
        select: { priorExperienceYears: true },
      }),
    ]);
    return {
      qualifications,
      languages,
      certifications,
      priorExperienceYears: owner?.priorExperienceYears ?? null,
    };
  }

  // ── Habilitações ──
  async addQualification(userId: number, dto: QualificationDto, user: CurrentUserData) {
    this.guardUser(userId, user);
    return this.prisma.userQualification.create({ data: { userId, ...dto } });
  }

  async updateQualification(
    userId: number,
    id: number,
    dto: QualificationDto,
    user: CurrentUserData,
  ) {
    this.guardItem(
      await this.prisma.read.userQualification.findUnique({ where: { id } }),
      userId,
      user,
    );
    return this.prisma.userQualification.update({ where: { id }, data: dto });
  }

  async removeQualification(userId: number, id: number, user: CurrentUserData) {
    this.guardItem(
      await this.prisma.read.userQualification.findUnique({ where: { id } }),
      userId,
      user,
    );
    await this.prisma.userQualification.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ── Idiomas ──
  async addLanguage(userId: number, dto: LanguageDto, user: CurrentUserData) {
    this.guardUser(userId, user);
    return this.prisma.userLanguage.upsert({
      where: { userId_language: { userId, language: dto.language } },
      update: { level: dto.level },
      create: { userId, language: dto.language, level: dto.level },
    });
  }

  async removeLanguage(userId: number, id: number, user: CurrentUserData) {
    this.guardItem(await this.prisma.read.userLanguage.findUnique({ where: { id } }), userId, user);
    await this.prisma.userLanguage.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ── Certificações externas ──
  private certData(dto: ExternalCertificationDto) {
    return {
      name: dto.name,
      issuer: dto.issuer ?? null,
      issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
    };
  }

  async addCertification(userId: number, dto: ExternalCertificationDto, user: CurrentUserData) {
    this.guardUser(userId, user);
    return this.prisma.userExternalCertification.create({
      data: { userId, ...this.certData(dto) },
    });
  }

  async updateCertification(
    userId: number,
    id: number,
    dto: ExternalCertificationDto,
    user: CurrentUserData,
  ) {
    this.guardItem(
      await this.prisma.read.userExternalCertification.findUnique({ where: { id } }),
      userId,
      user,
    );
    return this.prisma.userExternalCertification.update({
      where: { id },
      data: this.certData(dto),
    });
  }

  async removeCertification(userId: number, id: number, user: CurrentUserData) {
    this.guardItem(
      await this.prisma.read.userExternalCertification.findUnique({ where: { id } }),
      userId,
      user,
    );
    await this.prisma.userExternalCertification.delete({ where: { id } });
    return { id, deleted: true };
  }

  // ── Experiência anterior ──
  async setExperience(userId: number, years: number, user: CurrentUserData) {
    this.guardUser(userId, user);
    await this.prisma.user.update({ where: { id: userId }, data: { priorExperienceYears: years } });
    return { userId, priorExperienceYears: years };
  }
}
