-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLOCKED', 'PENDING');
CREATE TYPE "HrStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'TERMINATED');
CREATE TYPE "PermissionAction" AS ENUM ('VIEW', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'EXPORT', 'EXECUTE', 'ALL');
CREATE TYPE "PermissionSubject" AS ENUM ('DASHBOARD', 'REPORTS', 'USERS', 'ROLES', 'LMS', 'PERFORMANCE', 'ENGAGEMENT', 'TALENT', 'EVALUATION', 'CONTENT_LIBRARY', 'AVATAR_TRAINING', 'ROI_IMPACT', 'HISTORY', 'PAYROLL', 'SENSITIVE_DATA', 'ACL', 'HR');
CREATE TYPE "DepartmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "UnitType" AS ENUM ('HEADQUARTERS', 'BRANCH', 'REMOTE', 'PROJECT');
CREATE TYPE "PositionLevel" AS ENUM ('INTERN', 'JUNIOR', 'MID', 'SENIOR', 'LEAD', 'MANAGER', 'DIRECTOR', 'EXECUTIVE');
CREATE TYPE "OrgChangeType" AS ENUM ('PROMOTION', 'TRANSFER', 'RESTRUCTURE', 'HIRE', 'TERMINATION', 'MANAGER_CHANGE');

-- AlterTable: User
ALTER TABLE "User" ALTER COLUMN "accountStatus" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "accountStatus" TYPE "AccountStatus" USING ("accountStatus"::"AccountStatus");
ALTER TABLE "User" ALTER COLUMN "accountStatus" SET DEFAULT 'PENDING';

ALTER TABLE "User" ALTER COLUMN "hrStatus" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "hrStatus" TYPE "HrStatus" USING ("hrStatus"::"HrStatus");
ALTER TABLE "User" ALTER COLUMN "hrStatus" SET DEFAULT 'ACTIVE';

-- AlterTable: Permission
ALTER TABLE "Permission" ALTER COLUMN "action" TYPE "PermissionAction" USING ("action"::"PermissionAction");
ALTER TABLE "Permission" ALTER COLUMN "subject" TYPE "PermissionSubject" USING ("subject"::"PermissionSubject");

-- AlterTable: Department
ALTER TABLE "Department" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Department" ALTER COLUMN "status" TYPE "DepartmentStatus" USING ("status"::"DepartmentStatus");
ALTER TABLE "Department" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';

-- AlterTable: Unit
ALTER TABLE "Unit" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Unit" ALTER COLUMN "type" TYPE "UnitType" USING ("type"::"UnitType");
ALTER TABLE "Unit" ALTER COLUMN "type" SET DEFAULT 'BRANCH';

-- AlterTable: Position
ALTER TABLE "Position" ALTER COLUMN "level" TYPE "PositionLevel" USING ("level"::"PositionLevel");

-- AlterTable: OrgChangeLog
ALTER TABLE "OrgChangeLog" ALTER COLUMN "changeType" TYPE "OrgChangeType" USING ("changeType"::"OrgChangeType");
