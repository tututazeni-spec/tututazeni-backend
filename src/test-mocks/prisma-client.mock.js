'use strict';

// Mock global de @prisma/client para Jest (compatibilidade com Prisma 7 WASM em Windows)
// Inclui todos os enums do schema.prisma para que os testes de serviço funcionem correctamente.

class PrismaClient {
  $connect() {
    return Promise.resolve();
  }
  $disconnect() {
    return Promise.resolve();
  }
  $on() {}
  $use() {}
  $extends() {
    return this;
  }
}

const Prisma = {
  PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
    constructor(message, { code, clientVersion } = {}) {
      super(message);
      this.code = code;
      this.clientVersion = clientVersion;
    }
  },
  PrismaClientValidationError: class PrismaClientValidationError extends Error {},
  PrismaClientInitializationError: class PrismaClientInitializationError extends Error {},
};

// ── Enums (gerados a partir do schema.prisma) ─────────────────────────────────

const UserRole = { COLABORADOR: 'COLABORADOR', LIDER: 'LIDER', RH: 'RH', ADMIN: 'ADMIN' };

const AccountStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  SUSPENDED: 'SUSPENDED',
  BLOCKED: 'BLOCKED',
  PENDING: 'PENDING',
};

const HrStatus = { ACTIVE: 'ACTIVE', ON_LEAVE: 'ON_LEAVE', TERMINATED: 'TERMINATED' };

const PermissionAction = {
  VIEW: 'VIEW',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  APPROVE: 'APPROVE',
  EXPORT: 'EXPORT',
  EXECUTE: 'EXECUTE',
  ALL: 'ALL',
};

const PermissionSubject = {
  DASHBOARD: 'DASHBOARD',
  REPORTS: 'REPORTS',
  USERS: 'USERS',
  ROLES: 'ROLES',
  LMS: 'LMS',
  PERFORMANCE: 'PERFORMANCE',
  ENGAGEMENT: 'ENGAGEMENT',
  TALENT: 'TALENT',
  EVALUATION: 'EVALUATION',
  CONTENT_LIBRARY: 'CONTENT_LIBRARY',
  AVATAR_TRAINING: 'AVATAR_TRAINING',
  ROI_IMPACT: 'ROI_IMPACT',
  HISTORY: 'HISTORY',
  PAYROLL: 'PAYROLL',
  SENSITIVE_DATA: 'SENSITIVE_DATA',
  ACL: 'ACL',
  HR: 'HR',
};

const DepartmentStatus = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' };

const UnitType = {
  HEADQUARTERS: 'HEADQUARTERS',
  BRANCH: 'BRANCH',
  REMOTE: 'REMOTE',
  PROJECT: 'PROJECT',
};

const PositionLevel = {
  INTERN: 'INTERN',
  JUNIOR: 'JUNIOR',
  MID: 'MID',
  SENIOR: 'SENIOR',
  LEAD: 'LEAD',
  MANAGER: 'MANAGER',
  DIRECTOR: 'DIRECTOR',
  EXECUTIVE: 'EXECUTIVE',
};

const OrgChangeType = {
  PROMOTION: 'PROMOTION',
  TRANSFER: 'TRANSFER',
  RESTRUCTURE: 'RESTRUCTURE',
  HIRE: 'HIRE',
  TERMINATION: 'TERMINATION',
  MANAGER_CHANGE: 'MANAGER_CHANGE',
};

const EvalType = { SELF: 'SELF', MANAGER: 'MANAGER', PEER: 'PEER', SUBORDINATE: 'SUBORDINATE' };

const CertificateType = {
  COURSE: 'COURSE',
  TRAINING: 'TRAINING',
  LEADERSHIP: 'LEADERSHIP',
  DEVELOPMENT: 'DEVELOPMENT',
};

const EventStatus = { PENDING: 'PENDING', CONFIRMED: 'CONFIRMED', CANCELED: 'CANCELED' };

const ReportFormat = { PDF: 'PDF' };

const AiRole = { USER: 'USER', ASSISTANT: 'ASSISTANT', SYSTEM: 'SYSTEM' };

const EmployeeStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ON_LEAVE: 'ON_LEAVE',
  TERMINATED: 'TERMINATED',
  SUSPENDED: 'SUSPENDED',
};

const ContractType = {
  INDEFINITE: 'INDEFINITE',
  FIXED_TERM: 'FIXED_TERM',
  UNCERTAIN_TERM: 'UNCERTAIN_TERM',
  APPRENTICESHIP: 'APPRENTICESHIP',
  INTERNSHIP: 'INTERNSHIP',
  SERVICE_PROVISION: 'SERVICE_PROVISION',
  TEMPORARY_PLACEMENT: 'TEMPORARY_PLACEMENT',
  PART_TIME: 'PART_TIME',
};

const WorkMode = { REMOTE: 'REMOTE', HYBRID: 'HYBRID', ON_SITE: 'ON_SITE' };

const SeniorityLevel = {
  JUNIOR: 'JUNIOR',
  MID: 'MID',
  SENIOR: 'SENIOR',
  LEAD: 'LEAD',
  MANAGER: 'MANAGER',
  DIRECTOR: 'DIRECTOR',
  C_LEVEL: 'C_LEVEL',
};

const Gender = {
  MALE: 'MALE',
  FEMALE: 'FEMALE',
  NON_BINARY: 'NON_BINARY',
  PREFER_NOT_TO_SAY: 'PREFER_NOT_TO_SAY',
};

const SkillType = {
  TECHNICAL: 'TECHNICAL',
  BEHAVIORAL: 'BEHAVIORAL',
  LEADERSHIP: 'LEADERSHIP',
  LANGUAGE: 'LANGUAGE',
  CERTIFICATION: 'CERTIFICATION',
  TOOL: 'TOOL',
};

const TimelineEventType = {
  HIRED: 'HIRED',
  PROMOTED: 'PROMOTED',
  TRANSFERRED: 'TRANSFERRED',
  SALARY_CHANGE: 'SALARY_CHANGE',
  COURSE: 'COURSE',
  EVALUATION: 'EVALUATION',
  PDI: 'PDI',
  EVENT: 'EVENT',
  BADGE: 'BADGE',
  DOCUMENT: 'DOCUMENT',
  NOTE: 'NOTE',
};

const EnrollmentStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
  OVERDUE: 'OVERDUE',
};

const RequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
};

const RequestType = {
  DATA_CHANGE: 'DATA_CHANGE',
  PROMOTION: 'PROMOTION',
  TRANSFER: 'TRANSFER',
  TERMINATION: 'TERMINATION',
  LEAVE: 'LEAVE',
  BENEFIT_CHANGE: 'BENEFIT_CHANGE',
};

const AttendanceStatus = {
  PRESENT: 'PRESENT',
  LATE: 'LATE',
  PARTIAL: 'PARTIAL',
  ABSENT: 'ABSENT',
  JUSTIFIED: 'JUSTIFIED',
  REMOTE: 'REMOTE',
  ON_LEAVE: 'ON_LEAVE',
  HALF_DAY_AM: 'HALF_DAY_AM',
  HALF_DAY_PM: 'HALF_DAY_PM',
  RECORDED: 'RECORDED',
  HOLIDAY: 'HOLIDAY',
};

const CheckInMethod = {
  MANUAL: 'MANUAL',
  QR_STATIC: 'QR_STATIC',
  QR_DYNAMIC: 'QR_DYNAMIC',
  GEOLOCATION: 'GEOLOCATION',
  FACIAL: 'FACIAL',
  NFC: 'NFC',
  TOKEN: 'TOKEN',
  VIRTUAL_LINK: 'VIRTUAL_LINK',
  FACILITATOR: 'FACILITATOR',
};

const AttendanceContext = {
  WORK: 'WORK',
  EVENT: 'EVENT',
  WEBINAR: 'WEBINAR',
  LMS: 'LMS',
  MENTORING: 'MENTORING',
  PRACTICAL: 'PRACTICAL',
};

const LeaveType = {
  VACATION: 'VACATION',
  SICK_LEAVE: 'SICK_LEAVE',
  MATERNITY: 'MATERNITY',
  PATERNITY: 'PATERNITY',
  JUSTIFIED_ABSENCE: 'JUSTIFIED_ABSENCE',
  UNJUSTIFIED_ABSENCE: 'UNJUSTIFIED_ABSENCE',
  BEREAVEMENT: 'BEREAVEMENT',
  TRAINING: 'TRAINING',
  PUBLIC_DUTY: 'PUBLIC_DUTY',
  OTHER: 'OTHER',
};

const LeaveStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED',
};

const LeaveCategory = {
  STATUTORY: 'STATUTORY',
  MEDICAL: 'MEDICAL',
  FAMILY: 'FAMILY',
  TRAINING: 'TRAINING',
  FLEXIBLE: 'FLEXIBLE',
  UNPAID: 'UNPAID',
  DISCIPLINARY: 'DISCIPLINARY',
  OTHER: 'OTHER',
};

const DurationMode = {
  FULL_DAY: 'FULL_DAY',
  HALF_AM: 'HALF_AM',
  HALF_PM: 'HALF_PM',
  HOURS: 'HOURS',
};

const ShiftType = {
  MORNING: 'MORNING',
  AFTERNOON: 'AFTERNOON',
  NIGHT: 'NIGHT',
  FULL_DAY: 'FULL_DAY',
  ROTATING: 'ROTATING',
  ON_CALL: 'ON_CALL',
  FLEXIBLE: 'FLEXIBLE',
};

const OvertimeStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPENSATED: 'COMPENSATED',
  PAID: 'PAID',
};

const PayslipStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  ISSUED: 'ISSUED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  CANCELLED: 'CANCELLED',
};

const PayrollRunStatus = {
  DRAFT: 'DRAFT',
  PROCESSING: 'PROCESSING',
  CALCULATED: 'CALCULATED',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  CANCELLED: 'CANCELLED',
};

const ComponentType = { EARNING: 'EARNING', DEDUCTION: 'DEDUCTION' };

const ComponentCalcType = {
  FIXED: 'FIXED',
  PERCENT: 'PERCENT',
  FORMULA: 'FORMULA',
  TABLE: 'TABLE',
};

const DocumentRequestStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  GENERATED: 'GENERATED',
  ISSUED: 'ISSUED',
  EXPIRED: 'EXPIRED',
};

const WorkDeclStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
};

const WorkDeclType = {
  STANDARD: 'STANDARD',
  OVERTIME: 'OVERTIME',
  REMOTE: 'REMOTE',
  OTHER: 'OTHER',
};

const DeclarationStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  SIGNED: 'SIGNED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
};

const DeclarationLocale = { PT: 'PT', EN: 'EN', FR: 'FR' };

const SignatureType = { ELECTRONIC: 'ELECTRONIC', DIGITAL: 'DIGITAL', BIOMETRIC: 'BIOMETRIC' };

const DeclarationType = {
  EMPLOYMENT: 'EMPLOYMENT',
  SALARY: 'SALARY',
  ROLE: 'ROLE',
  EXPERIENCE: 'EXPERIENCE',
  CUSTOM: 'CUSTOM',
};

const DocumentLayout = {
  A4_PORTRAIT: 'A4_PORTRAIT',
  A4_LANDSCAPE: 'A4_LANDSCAPE',
  LETTER: 'LETTER',
};

const TemplateLanguage = { PT: 'PT', EN: 'EN', FR: 'FR' };

const PurposeCategory = {
  BANKING: 'BANKING',
  VISA: 'VISA',
  LEGAL: 'LEGAL',
  INTERNAL: 'INTERNAL',
  OTHER: 'OTHER',
};

const DocCategoryType = {
  PERSONAL: 'PERSONAL',
  CONTRACT: 'CONTRACT',
  CERTIFICATE: 'CERTIFICATE',
  TRAINING: 'TRAINING',
  PERFORMANCE: 'PERFORMANCE',
  COMPLIANCE: 'COMPLIANCE',
  OTHER: 'OTHER',
};

const DocAccess = { PUBLIC: 'PUBLIC', RESTRICTED: 'RESTRICTED', PRIVATE: 'PRIVATE' };

const DocSensitivity = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };

const DocStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  DELETED: 'DELETED',
  EXPIRED: 'EXPIRED',
};

const ShareLinkAccess = { VIEW: 'VIEW', DOWNLOAD: 'DOWNLOAD' };

const CareerPlanStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

const CareerPathType = { LINEAR: 'LINEAR', LATERAL: 'LATERAL', DIAGONAL: 'DIAGONAL' };

const ReadinessLevel = {
  NOT_READY: 'NOT_READY',
  DEVELOPING: 'DEVELOPING',
  READY: 'READY',
  EXCEEDS: 'EXCEEDS',
};

const PromotionStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED',
};

const GoalType = {
  INDIVIDUAL: 'INDIVIDUAL',
  TEAM: 'TEAM',
  DEPARTMENT: 'DEPARTMENT',
  COMPANY: 'COMPANY',
};

const GoalStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  OVERDUE: 'OVERDUE',
};

const AssessmentSource = { MANUAL: 'MANUAL', AI: 'AI', SURVEY: 'SURVEY', SYSTEM: 'SYSTEM' };

const GapPriority = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };

const TenantPlan = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  PROFESSIONAL: 'PROFESSIONAL',
  ENTERPRISE: 'ENTERPRISE',
};

const SsoProvider = { GOOGLE: 'GOOGLE', MICROSOFT: 'MICROSOFT', SAML: 'SAML', OIDC: 'OIDC' };

const IntegrationType = {
  HR_SYSTEM: 'HR_SYSTEM',
  LMS: 'LMS',
  PAYROLL: 'PAYROLL',
  ERP: 'ERP',
  OTHER: 'OTHER',
};

const IntegrationStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ERROR: 'ERROR',
  PENDING: 'PENDING',
};

const SyncFrequency = {
  REALTIME: 'REALTIME',
  HOURLY: 'HOURLY',
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MANUAL: 'MANUAL',
};

const AutomationTrigger = {
  ON_HIRE: 'ON_HIRE',
  ON_PROMOTION: 'ON_PROMOTION',
  ON_ANNIVERSARY: 'ON_ANNIVERSARY',
  ON_EVALUATION: 'ON_EVALUATION',
  SCHEDULED: 'SCHEDULED',
  MANUAL: 'MANUAL',
};

const AlertSeverity = { INFO: 'INFO', WARNING: 'WARNING', ERROR: 'ERROR', CRITICAL: 'CRITICAL' };

const AlertCategory = {
  PERFORMANCE: 'PERFORMANCE',
  COMPLIANCE: 'COMPLIANCE',
  SYSTEM: 'SYSTEM',
  HR: 'HR',
  SECURITY: 'SECURITY',
};

const BeneficiaryType = { EMPLOYEE: 'EMPLOYEE', DEPENDENT: 'DEPENDENT', EMERGENCY: 'EMERGENCY' };

const BeneficiaryStatus = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE', PENDING: 'PENDING' };

const AngolaProvince = {
  LUANDA: 'LUANDA',
  BENGUELA: 'BENGUELA',
  HUILA: 'HUILA',
  HUAMBO: 'HUAMBO',
  CABINDA: 'CABINDA',
  KWANZA_SUL: 'KWANZA_SUL',
  KWANZA_NORTE: 'KWANZA_NORTE',
  MALANJE: 'MALANJE',
  LUNDA_NORTE: 'LUNDA_NORTE',
  LUNDA_SUL: 'LUNDA_SUL',
  MOXICO: 'MOXICO',
  BIE: 'BIE',
  CUANDO_CUBANGO: 'CUANDO_CUBANGO',
  CUNENE: 'CUNENE',
  NAMIBE: 'NAMIBE',
  ZAIRE: 'ZAIRE',
  UIGE: 'UIGE',
  BENGO: 'BENGO',
};

const InteractionType = {
  EMAIL: 'EMAIL',
  CALL: 'CALL',
  MEETING: 'MEETING',
  VISIT: 'VISIT',
  EVENT: 'EVENT',
  NOTE: 'NOTE',
};

const NeedPriority = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };

const NeedStatus = {
  IDENTIFIED: 'IDENTIFIED',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
  CANCELLED: 'CANCELLED',
};

const PartnerType = {
  ACADEMIC: 'ACADEMIC',
  TECHNOLOGY: 'TECHNOLOGY',
  CONTENT: 'CONTENT',
  TRAINING: 'TRAINING',
  FUNDING: 'FUNDING',
  INSTITUTIONAL: 'INSTITUTIONAL',
  COMMERCIAL: 'COMMERCIAL',
  MEDIA: 'MEDIA',
  GOVERNMENT: 'GOVERNMENT',
  OTHER: 'OTHER',
};

const PartnerTier = { PLATINUM: 'PLATINUM', GOLD: 'GOLD', SILVER: 'SILVER', STANDARD: 'STANDARD' };

const PartnerStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  NEGOTIATION: 'NEGOTIATION',
  SUSPENDED: 'SUSPENDED',
  FORMER: 'FORMER',
};

const PartnerInteractionType = {
  EMAIL: 'EMAIL',
  CALL: 'CALL',
  MEETING: 'MEETING',
  VISIT: 'VISIT',
  EVENT: 'EVENT',
  NOTE: 'NOTE',
  REVIEW: 'REVIEW',
};

const MilestoneStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  OVERDUE: 'OVERDUE',
};

const FunderType = {
  GOVERNMENT: 'GOVERNMENT',
  BILATERAL: 'BILATERAL',
  MULTILATERAL: 'MULTILATERAL',
  NGO: 'NGO',
  PRIVATE_FOUNDATION: 'PRIVATE_FOUNDATION',
  CORPORATE: 'CORPORATE',
  OTHER: 'OTHER',
};

const FunderStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  PROSPECT: 'PROSPECT',
  FORMER: 'FORMER',
  SUSPENDED: 'SUSPENDED',
};

const GrantStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
  CLOSED: 'CLOSED',
};

const FunderInteractionType = {
  EMAIL: 'EMAIL',
  CALL: 'CALL',
  MEETING: 'MEETING',
  VISIT: 'VISIT',
  EVENT: 'EVENT',
  NOTE: 'NOTE',
  REVIEW: 'REVIEW',
};

const ReportStatus = {
  PENDING: 'PENDING',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  OVERDUE: 'OVERDUE',
};

const LibraryItemType = {
  PDF: 'PDF',
  EBOOK: 'EBOOK',
  VIDEO: 'VIDEO',
  AUDIO: 'AUDIO',
  PRESENTATION: 'PRESENTATION',
  SPREADSHEET: 'SPREADSHEET',
  DOCUMENT: 'DOCUMENT',
  IMAGE: 'IMAGE',
  LINK: 'LINK',
  SCORM: 'SCORM',
  OTHER: 'OTHER',
};

const LibraryAction = { VIEW: 'VIEW', DOWNLOAD: 'DOWNLOAD', SHARE: 'SHARE', PRINT: 'PRINT' };

const CertificateTemplateType = {
  COURSE: 'COURSE',
  PROGRAM: 'PROGRAM',
  COMPETENCY: 'COMPETENCY',
  ATTENDANCE: 'ATTENDANCE',
  PARTICIPATION: 'PARTICIPATION',
  ACHIEVEMENT: 'ACHIEVEMENT',
};

const BadgeLevel = {
  BASIC: 'BASIC',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
  EXPERT: 'EXPERT',
  MASTER: 'MASTER',
};

const SnapshotType = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUAL: 'ANNUAL',
};

const WidgetType = {
  KPI_CARD: 'KPI_CARD',
  LINE_CHART: 'LINE_CHART',
  BAR_CHART: 'BAR_CHART',
  PIE_CHART: 'PIE_CHART',
  TABLE: 'TABLE',
  ALERT_LIST: 'ALERT_LIST',
  RANKING: 'RANKING',
  MAP: 'MAP',
};

const AcademicYearStatus = {
  PLANNING: 'PLANNING',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
};

const PeriodType = { SEMESTER: 'SEMESTER', QUARTER: 'QUARTER', MODULE: 'MODULE', ANNUAL: 'ANNUAL' };

const ProgramLevel = {
  BASIC: 'BASIC',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
  EXPERT: 'EXPERT',
};

const ClassModality = { ONLINE: 'ONLINE', PRESENTIAL: 'PRESENTIAL', HYBRID: 'HYBRID' };

const ClassStatus = {
  SCHEDULED: 'SCHEDULED',
  ONGOING: 'ONGOING',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

const AcademicEnrollmentStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  DROPPED: 'DROPPED',
  SUSPENDED: 'SUSPENDED',
};

const PathLevel = {
  BASIC: 'BASIC',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
  EXPERT: 'EXPERT',
};

const PathEnrollmentStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  PAUSED: 'PAUSED',
  DROPPED: 'DROPPED',
};

const SessionPlatform = {
  ZOOM: 'ZOOM',
  TEAMS: 'TEAMS',
  MEET: 'MEET',
  WEBEX: 'WEBEX',
  OTHER: 'OTHER',
};

const SessionStatus = {
  SCHEDULED: 'SCHEDULED',
  LIVE: 'LIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  POSTPONED: 'POSTPONED',
};

const OkrType = { ANNUAL: 'ANNUAL', QUARTERLY: 'QUARTERLY', MONTHLY: 'MONTHLY' };

const OkrStatus = { DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', CLOSED: 'CLOSED', ARCHIVED: 'ARCHIVED' };

const ObjectiveType = { COMPANY: 'COMPANY', TEAM: 'TEAM', INDIVIDUAL: 'INDIVIDUAL' };

const IndicatorFrequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUAL: 'ANNUAL',
};

const EvalCycleType = {
  ANNUAL: 'ANNUAL',
  SEMI_ANNUAL: 'SEMI_ANNUAL',
  QUARTERLY: 'QUARTERLY',
  PROBATION: 'PROBATION',
};

const EvaluationStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  SELF_EVAL: 'SELF_EVAL',
  MANAGER_EVAL: 'MANAGER_EVAL',
  CALIBRATION: 'CALIBRATION',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
};

module.exports = {
  PrismaClient,
  Prisma,
  // Enums
  UserRole,
  AccountStatus,
  HrStatus,
  PermissionAction,
  PermissionSubject,
  DepartmentStatus,
  UnitType,
  PositionLevel,
  OrgChangeType,
  EvalType,
  CertificateType,
  EventStatus,
  ReportFormat,
  AiRole,
  EmployeeStatus,
  EnrollmentStatus,
  ContractType,
  WorkMode,
  SeniorityLevel,
  Gender,
  SkillType,
  TimelineEventType,
  RequestStatus,
  RequestType,
  AttendanceStatus,
  CheckInMethod,
  AttendanceContext,
  LeaveType,
  LeaveStatus,
  LeaveCategory,
  DurationMode,
  ShiftType,
  OvertimeStatus,
  PayslipStatus,
  PayrollRunStatus,
  ComponentType,
  ComponentCalcType,
  DocumentRequestStatus,
  WorkDeclStatus,
  WorkDeclType,
  DeclarationStatus,
  DeclarationLocale,
  SignatureType,
  DeclarationType,
  DocumentLayout,
  TemplateLanguage,
  PurposeCategory,
  DocCategoryType,
  DocAccess,
  DocSensitivity,
  DocStatus,
  ShareLinkAccess,
  CareerPlanStatus,
  CareerPathType,
  ReadinessLevel,
  PromotionStatus,
  GoalType,
  GoalStatus,
  AssessmentSource,
  GapPriority,
  TenantPlan,
  SsoProvider,
  IntegrationType,
  IntegrationStatus,
  SyncFrequency,
  AutomationTrigger,
  AlertSeverity,
  AlertCategory,
  BeneficiaryType,
  BeneficiaryStatus,
  AngolaProvince,
  InteractionType,
  NeedPriority,
  NeedStatus,
  PartnerType,
  PartnerTier,
  PartnerStatus,
  PartnerInteractionType,
  MilestoneStatus,
  FunderType,
  FunderStatus,
  GrantStatus,
  FunderInteractionType,
  ReportStatus,
  LibraryItemType,
  LibraryAction,
  CertificateTemplateType,
  BadgeLevel,
  SnapshotType,
  WidgetType,
  AcademicYearStatus,
  PeriodType,
  ProgramLevel,
  ClassModality,
  ClassStatus,
  AcademicEnrollmentStatus,
  PathLevel,
  PathEnrollmentStatus,
  SessionPlatform,
  SessionStatus,
  OkrType,
  OkrStatus,
  ObjectiveType,
  IndicatorFrequency,
  EvalCycleType,
  EvaluationStatus,
};
