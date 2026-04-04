import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { IsInt, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLeaderProfileDto {
  @ApiProperty() @IsInt() userId!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() leadershipStyle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() strengths?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() developmentAreas?: string;
}

@Injectable()
export class LeaderService {
  constructor(private prisma: PrismaService) {}

  async getLeaders() {
    // Schema: User has no managerId/directReports; filter by role.name and active
    // Role is a relation (roleId -> Role.name), so we filter via role.name
    return this.prisma.user.findMany({
      where: {
        role: { name: { in: ['GESTOR', 'DIRECTOR', 'ADMIN'] } },
        active: true,
      },
      include: {
        position: true,
        department: true,
        // 'competencies' relation is named 'userCompetencies' in schema
        userCompetencies: {
          include: { competency: true },
        },
      },
      orderBy: { fullName: 'asc' },
    });
  }

  async getLeaderDashboard(leaderId: number) {
    // Schema has no managerId on User, no leaveRequest model, no task model.
    // We use unitId to group team members under the same unit as the leader.
    const leader = await this.prisma.user.findUnique({
      where: { id: leaderId },
      select: { unitId: true },
    });

    const unitId = leader?.unitId;

    const [teamMembers, teamEnrollments, teamPerformance] = await Promise.all([
      // Team = users in the same unit (excluding the leader themselves)
      this.prisma.user.findMany({
        where: { unitId: unitId ?? undefined, active: true, id: { not: leaderId } },
        include: {
          position: true,
          points: true,
          // 'performance' is the correct relation name on User -> PerformanceReview[]
          performance: {
            take: 1,
            orderBy: { createdAt: 'desc' },
          },
        },
      }),

      // Enrollments for team members in same unit
      this.prisma.enrollment.count({
        where: {
          user: { unitId: unitId ?? undefined, active: true, id: { not: leaderId } },
          // EnrollmentStatus enum values: EM_ANDAMENTO | CONCLUIDO | CANCELADO
          status: 'EM_ANDAMENTO',
        },
      }),

      // PerformanceReview: field is 'score', not 'overallScore'
      this.prisma.performanceReview.aggregate({
        where: {
          user: { unitId: unitId ?? undefined, active: true, id: { not: leaderId } },
        },
        _avg: { score: true },
      }),
    ]);

    const avgPerf = +(teamPerformance._avg.score ?? 0).toFixed(2);

    return {
      leader: { id: leaderId },
      team: { count: teamMembers.length, members: teamMembers },
      metrics: {
        activeEnrollments: teamEnrollments,
        avgPerformance: avgPerf,
      },
    };
  }

  async getTeamPerformance(leaderId: number, period?: string) {
    const leader = await this.prisma.user.findUnique({
      where: { id: leaderId },
      select: { unitId: true },
    });

    const unitId = leader?.unitId;

    const where: any = {
      user: { unitId: unitId ?? undefined, active: true, id: { not: leaderId } },
    };
    if (period) where.period = { contains: period };

    return this.prisma.performanceReview.findMany({
      where,
      include: {
        user: { select: { id: true, fullName: true, position: true } },
      },
      // Correct field name is 'score', not 'overallScore'
      orderBy: { score: 'desc' },
    });
  }

  // NOTE: LeaderProfile model does not exist in the current schema.
  // This method stores leadership metadata inside the existing Profile model,
  // or you can add a LeaderProfile model to schema.prisma (see comment below).
  //
  // Option A (current): persist to Profile.bio as JSON until schema is extended.
  async upsertProfile(dto: CreateLeaderProfileDto) {
    const meta = JSON.stringify({
      leadershipStyle: dto.leadershipStyle,
      strengths: dto.strengths,
      developmentAreas: dto.developmentAreas,
    });

    return this.prisma.profile.upsert({
      where: { userId: dto.userId },
      create: { userId: dto.userId, bio: meta },
      update: { bio: meta },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }
}

/*
 * ─── SCHEMA ADDITIONS NEEDED ────────────────────────────────────────────────
 *
 * To fully restore the original intent of this service, add these to schema.prisma
 * and run `npx prisma migrate dev`:
 *
 * 1. managerId on User (self-relation for direct reports):
 *
 *    model User {
 *      ...
 *      managerId    Int?
 *      manager      User?   @relation("DirectReports", fields: [managerId], references: [id])
 *      directReports User[] @relation("DirectReports")
 *    }
 *
 * 2. LeaderProfile model:
 *
 *    model LeaderProfile {
 *      id               Int     @id @default(autoincrement())
 *      userId           Int     @unique
 *      leadershipStyle  String? @db.Text
 *      strengths        String? @db.Text
 *      developmentAreas String? @db.Text
 *      user             User    @relation(fields: [userId], references: [id], onDelete: Cascade)
 *    }
 *
 * 3. PerformanceReview.overallScore (rename 'score' → 'overallScore', or add new field):
 *    Change `score Float` to `overallScore Float` in the PerformanceReview model.
 *
 * After adding these, revert the dashboard/getLeaders methods to use managerId
 * and replace Profile upsert with leaderProfile upsert.
 * ────────────────────────────────────────────────────────────────────────────
 */