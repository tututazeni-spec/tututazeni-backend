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

const CycleType = {
  PROBATION: 'PROBATION',
  QUARTERLY: 'QUARTERLY',
  SEMESTER: 'SEMESTER',
  ANNUAL: 'ANNUAL',
  AD_HOC: 'AD_HOC',
};

const CycleStatus = {
  PLANNED: 'PLANNED',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
};

const ReviewType = { SELF: 'SELF', MANAGER: 'MANAGER', PEER: 'PEER', R360: 'R360' };

const ReviewStatus = {
  DRAFT: 'DRAFT',
  PENDING_SELF: 'PENDING_SELF',
  PENDING_MANAGER: 'PENDING_MANAGER',
  PENDING_360: 'PENDING_360',
  CALIBRATION: 'CALIBRATION',
  PUBLISHED: 'PUBLISHED',
  DISPUTE: 'DISPUTE',
  FINALIZED: 'FINALIZED',
};

const PerformanceCategory = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' };

const PerformanceGoalStatus = {
  ON_TRACK: 'ON_TRACK',
  AT_RISK: 'AT_RISK',
  OFF_TRACK: 'OFF_TRACK',
  COMPLETED: 'COMPLETED',
};

const FeedbackType = { PRAISE: 'PRAISE', IMPROVEMENT: 'IMPROVEMENT', GENERAL: 'GENERAL' };

const DisputeStatus = { OPEN: 'OPEN', RESOLVED: 'RESOLVED' };

const EvaluationRequestStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
};

const LeadershipProgramLevel = {
  INITIAL: 'INITIAL',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
};

const ProgramStatus = { DRAFT: 'DRAFT', ACTIVE: 'ACTIVE', ARCHIVED: 'ARCHIVED' };

const ParticipantStatus = {
  ENROLLED: 'ENROLLED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  WITHDRAWN: 'WITHDRAWN',
};

const OneOnOneStatus = {
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  RESCHEDULED: 'RESCHEDULED',
};

const LeadershipClassification = {
  CRITICAL: 'CRITICAL',
  BELOW_AVERAGE: 'BELOW_AVERAGE',
  AVERAGE: 'AVERAGE',
  ABOVE_AVERAGE: 'ABOVE_AVERAGE',
  TOP_10: 'TOP_10',
};

const CourseLevel = { BEGINNER: 'BEGINNER', INTERMEDIATE: 'INTERMEDIATE', ADVANCED: 'ADVANCED' };

const CourseStatus = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED' };

const ModuleStatus = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED' };

const ModuleType = {
  THEORETICAL: 'THEORETICAL',
  PRACTICAL: 'PRACTICAL',
  ASSESSMENT: 'ASSESSMENT',
  PROJECT: 'PROJECT',
};

const ProgressionType = { SEQUENTIAL: 'SEQUENTIAL', FREE: 'FREE', HYBRID: 'HYBRID' };

const CompletionRule = {
  ALL_LESSONS: 'ALL_LESSONS',
  MIN_PERCENT: 'MIN_PERCENT',
  QUIZ_PASS: 'QUIZ_PASS',
  COMBINED: 'COMBINED',
};

const LessonType = {
  VIDEO: 'VIDEO',
  PDF: 'PDF',
  TEXT: 'TEXT',
  AUDIO: 'AUDIO',
  SLIDE: 'SLIDE',
  LINK: 'LINK',
  SCORM: 'SCORM',
  QUIZ: 'QUIZ',
};

const EnrollmentOrigin = {
  MANUAL: 'MANUAL',
  SELF_ENROLL: 'SELF_ENROLL',
  LEARNING_PATH: 'LEARNING_PATH',
  ONBOARDING: 'ONBOARDING',
  RULE_ENGINE: 'RULE_ENGINE',
  CAMPAIGN: 'CAMPAIGN',
  AI_TUTOR: 'AI_TUTOR',
  INSTRUCTOR: 'INSTRUCTOR',
};

const QuizQuestionType = {
  MULTIPLE_CHOICE: 'MULTIPLE_CHOICE',
  TRUE_FALSE: 'TRUE_FALSE',
  OPEN: 'OPEN',
};

const LearningPathLevel = {
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
};

const LearningPathType = {
  ONBOARDING: 'ONBOARDING',
  UPSKILLING: 'UPSKILLING',
  RESKILLING: 'RESKILLING',
  COMPLIANCE: 'COMPLIANCE',
  LEADERSHIP: 'LEADERSHIP',
  CERTIFICATION: 'CERTIFICATION',
  CUSTOM: 'CUSTOM',
};

const LearningPathStatus = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED' };

const AssignmentTarget = {
  USER: 'USER',
  DEPARTMENT: 'DEPARTMENT',
  POSITION: 'POSITION',
  UNIT: 'UNIT',
  ROLE: 'ROLE',
};

const LearningPathEnrollmentStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  EXPIRED: 'EXPIRED',
};

const AssessmentType = {
  QUIZ: 'QUIZ',
  EXAM: 'EXAM',
  DIAGNOSTIC: 'DIAGNOSTIC',
  PRACTICAL: 'PRACTICAL',
  SURVEY: 'SURVEY',
};

const AssessmentStatus = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED' };

const FeedbackMode = { IMMEDIATE: 'IMMEDIATE', ON_SUBMIT: 'ON_SUBMIT', RESULT_ONLY: 'RESULT_ONLY' };

const QuestionType = {
  MULTIPLE_CHOICE_SINGLE: 'MULTIPLE_CHOICE_SINGLE',
  MULTIPLE_CHOICE_MULTI: 'MULTIPLE_CHOICE_MULTI',
  TRUE_FALSE: 'TRUE_FALSE',
  OPEN_TEXT: 'OPEN_TEXT',
  FILE_UPLOAD: 'FILE_UPLOAD',
  MATCHING: 'MATCHING',
  ORDERING: 'ORDERING',
};

const AttemptStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  PASSED: 'PASSED',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
};

const CompetencyCategory = {
  HARD_SKILL: 'HARD_SKILL',
  SOFT_SKILL: 'SOFT_SKILL',
  LANGUAGE: 'LANGUAGE',
  TOOL: 'TOOL',
  LEADERSHIP: 'LEADERSHIP',
};

const CompetencyType = {
  BEHAVIORAL: 'BEHAVIORAL',
  HARD_SKILL: 'HARD_SKILL',
  SOFT_SKILL: 'SOFT_SKILL',
  CULTURE: 'CULTURE',
  LEADERSHIP: 'LEADERSHIP',
  VITALITY: 'VITALITY',
  CUSTOM: 'CUSTOM',
};

const CompetencyStatus = { ACTIVE: 'ACTIVE', INACTIVE: 'INACTIVE' };

const CompetencySource = {
  MANUAL: 'MANUAL',
  COURSE: 'COURSE',
  ASSESSMENT: 'ASSESSMENT',
  MANAGER: 'MANAGER',
  HRIS: 'HRIS',
};

const MappingPriority = { MANDATORY: 'MANDATORY', OPTIONAL: 'OPTIONAL' };

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

const EventStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  LIVE: 'LIVE',
  ENDED: 'ENDED',
  CANCELLED: 'CANCELLED',
};

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
  ISSUED: 'ISSUED',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  DISPUTED: 'DISPUTED',
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

const CareerPathType = {
  LINEAR: 'LINEAR',
  Y_SHAPED: 'Y_SHAPED',
  T_SHAPED: 'T_SHAPED',
  W_SHAPED: 'W_SHAPED',
  LATTICE: 'LATTICE',
};

const ReadinessLevel = {
  READY_NOW: 'READY_NOW',
  READY_SOON: 'READY_SOON',
  NEEDS_DEVELOPMENT: 'NEEDS_DEVELOPMENT',
};

const ApplicationStatus = {
  PENDING: 'PENDING',
  REVIEWING: 'REVIEWING',
  SHORTLISTED: 'SHORTLISTED',
  REJECTED: 'REJECTED',
  ACCEPTED: 'ACCEPTED',
};

const VacancyType = {
  PROMOTION: 'PROMOTION',
  LATERAL: 'LATERAL',
  GIG_PROJECT: 'GIG_PROJECT',
  JOB_ROTATION: 'JOB_ROTATION',
  SHADOWING: 'SHADOWING',
};

const VacancyStatus = { DRAFT: 'DRAFT', OPEN: 'OPEN', CLOSED: 'CLOSED', FILLED: 'FILLED' };

const SuccessorPriority = { PRIMARY: 'PRIMARY', SECONDARY: 'SECONDARY', TERTIARY: 'TERTIARY' };

const SuccessionPdiStatus = { ACTIVE: 'ACTIVE' };

const BusinessImpact = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };

const ReplacementTime = {
  IMMEDIATE: 'IMMEDIATE',
  SHORT_TERM: 'SHORT_TERM',
  MEDIUM_TERM: 'MEDIUM_TERM',
  LONG_TERM: 'LONG_TERM',
};

const RiskLevel = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };

const PlanPriority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
  CRITICAL: 'CRITICAL',
};

const PlanStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  OVERDUE: 'OVERDUE',
};

const ActionType = {
  COURSE: 'COURSE',
  MENTORING: 'MENTORING',
  COACHING: 'COACHING',
  READING: 'READING',
  PROJECT: 'PROJECT',
  JOB_ROTATION: 'JOB_ROTATION',
  MICROLEARNING: 'MICROLEARNING',
  WORKSHOP: 'WORKSHOP',
  CERTIFICATION: 'CERTIFICATION',
  SHADOWING: 'SHADOWING',
  PEER_COACHING: 'PEER_COACHING',
  FEEDBACK: 'FEEDBACK',
  CONFERENCE: 'CONFERENCE',
  OTHER: 'OTHER',
};

const ActionStatus = {
  TODO: 'TODO',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  BLOCKED: 'BLOCKED',
  CANCELLED: 'CANCELLED',
  OVERDUE: 'OVERDUE',
};

const EvidenceType = { FILE: 'FILE', LINK: 'LINK', NOTE: 'NOTE' };

const CheckinType = { QUICK: 'QUICK', STRUCTURED: 'STRUCTURED' };

const CheckpointStatus = { PENDING: 'PENDING', COMPLETED: 'COMPLETED' };

const ApprovalDecision = { APPROVE: 'APPROVE', REJECT: 'REJECT' };

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

const NeedPriority = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', URGENT: 'URGENT' };

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

const OnboardingStatus = {
  NOT_STARTED: 'NOT_STARTED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  ABANDONED: 'ABANDONED',
  ON_HOLD: 'ON_HOLD',
};

const TaskCategory = {
  DOCUMENTS: 'DOCUMENTS',
  IT_ACCESS: 'IT_ACCESS',
  TRAINING: 'TRAINING',
  SOCIAL: 'SOCIAL',
  BENEFITS: 'BENEFITS',
  ADMIN: 'ADMIN',
  MEETING: 'MEETING',
};

const TaskType = {
  TASK: 'TASK',
  COURSE: 'COURSE',
  LEARNING_PATH: 'LEARNING_PATH',
  PROCESS: 'PROCESS',
  DOCUMENT: 'DOCUMENT',
  MEETING: 'MEETING',
};

const TaskStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  BLOCKED: 'BLOCKED',
  SKIPPED: 'SKIPPED',
};

const TaskPhase = {
  PRE_BOARDING: 'PRE_BOARDING',
  DAY_1: 'DAY_1',
  WEEK_1: 'WEEK_1',
  DAY_30: 'DAY_30',
  DAY_60: 'DAY_60',
  DAY_90: 'DAY_90',
};

const ResponsibleRole = {
  SELF: 'SELF',
  HR: 'HR',
  MANAGER: 'MANAGER',
  IT: 'IT',
  BUDDY: 'BUDDY',
  EXTERNAL: 'EXTERNAL',
};

const DocumentStatus = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' };

const SurveyMilestone = { DAY_1: 'DAY_1', DAY_7: 'DAY_7', DAY_30: 'DAY_30', DAY_90: 'DAY_90' };

const ContentType = {
  VIDEO: 'VIDEO',
  TEXT: 'TEXT',
  AUDIO: 'AUDIO',
  INFOGRAPHIC: 'INFOGRAPHIC',
  QUIZ: 'QUIZ',
};

const ContentLevel = { BEGINNER: 'BEGINNER', INTERMEDIATE: 'INTERMEDIATE', ADVANCED: 'ADVANCED' };

const ContentStatus = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED' };

const MicroLearningAction = { LIKE: 'LIKE', SAVE: 'SAVE', SKIP: 'SKIP' };

const TrainingType = { PRESENTIAL: 'PRESENTIAL', ONLINE: 'ONLINE', HYBRID: 'HYBRID' };

const TrainingLevel = { BEGINNER: 'BEGINNER', INTERMEDIATE: 'INTERMEDIATE', ADVANCED: 'ADVANCED' };

const TrainingStatus = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', ARCHIVED: 'ARCHIVED' };

const TrainingParticipantStatus = {
  WAITLIST: 'WAITLIST',
  REGISTERED: 'REGISTERED',
  ATTENDED: 'ATTENDED',
  ABSENT: 'ABSENT',
  CANCELLED: 'CANCELLED',
  COMPLETED: 'COMPLETED',
};

const SessionModality = { PRESENTIAL: 'PRESENTIAL', ONLINE: 'ONLINE', HYBRID: 'HYBRID' };

const ArticleStatus = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
};

const ArticleAccess = {
  PUBLIC: 'PUBLIC',
  DEPARTMENT: 'DEPARTMENT',
  ROLE: 'ROLE',
  CONFIDENTIAL: 'CONFIDENTIAL',
};

const InteractionAction = {
  VIEW: 'VIEW',
  LIKE: 'LIKE',
  DISLIKE: 'DISLIKE',
  BOOKMARK: 'BOOKMARK',
  SHARE: 'SHARE',
};

const ProcessStatus = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
};

const StepType = {
  START: 'START',
  END: 'END',
  TASK: 'TASK',
  DECISION: 'DECISION',
  GATEWAY: 'GATEWAY',
  REVIEW: 'REVIEW',
};

const InstanceStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  ON_HOLD: 'ON_HOLD',
};

const StepProgressStatus = {
  WAITING: 'WAITING',
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  ESCALATED: 'ESCALATED',
  SKIPPED: 'SKIPPED',
};

const NotificationPriority = { LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };

const NotificationCategory = {
  LMS: 'LMS',
  PDI: 'PDI',
  PERFORMANCE: 'PERFORMANCE',
  HR: 'HR',
  ENGAGEMENT: 'ENGAGEMENT',
  GAMIFICATION: 'GAMIFICATION',
  SYSTEM: 'SYSTEM',
  ONBOARDING: 'ONBOARDING',
  KNOWLEDGE: 'KNOWLEDGE',
};

const DigestFrequency = { NONE: 'NONE', DAILY: 'DAILY', WEEKLY: 'WEEKLY' };

const AuditStatus = { SUCCESS: 'SUCCESS', FAILED: 'FAILED', DENIED: 'DENIED' };

const AutomationCategory = {
  HR: 'HR',
  LMS: 'LMS',
  PERFORMANCE: 'PERFORMANCE',
  ENGAGEMENT: 'ENGAGEMENT',
  GAMIFICATION: 'GAMIFICATION',
  OPERATIONAL: 'OPERATIONAL',
  CUSTOM: 'CUSTOM',
};

const ExecutionStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
};

const AuthType = { OAUTH2: 'OAUTH2', API_KEY: 'API_KEY', BASIC: 'BASIC', BEARER: 'BEARER' };

const SyncLogStatus = {
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
};

const ApiCallStatus = { OK: 'OK', ERROR: 'ERROR' };

const MobileSyncStatus = { SUCCESS: 'SUCCESS', FAILED: 'FAILED' };

const ReportType = {
  FLASH: 'FLASH',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUAL: 'ANNUAL',
  CUSTOM: 'CUSTOM',
  AUDIT: 'AUDIT',
};

const ExecutiveReportStatus = {
  DRAFT: 'DRAFT',
  IN_REVIEW: 'IN_REVIEW',
  APPROVED: 'APPROVED',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
};

const ReportConfidentiality = {
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  CONFIDENTIAL: 'CONFIDENTIAL',
  RESTRICTED: 'RESTRICTED',
};

const KpiStatus = { GREEN: 'GREEN', YELLOW: 'YELLOW', RED: 'RED' };

const PayslipAccessAction = { VIEW: 'VIEW', ADMIN_VIEW: 'ADMIN_VIEW' };

const DayPeriod = { AM: 'AM', PM: 'PM' };

const LeaveDecision = {
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  ESCALATE: 'ESCALATE',
  DELEGATE: 'DELEGATE',
  CANCELLED: 'CANCELLED',
};

const JustificationStatus = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' };

const LegacyCareerPlanStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
};

const LegacyPdiStatus = { ACTIVE: 'ACTIVE', COMPLETED: 'COMPLETED' };

const EmployeeDocumentStatus = { ACTIVE: 'ACTIVE', DELETED: 'DELETED' };

const SignerRole = { RH: 'RH', MANAGER: 'MANAGER', DIRECTOR: 'DIRECTOR' };

const AccessMethod = { QR_CODE: 'QR_CODE', DIRECT_LINK: 'DIRECT_LINK', EMAIL_LINK: 'EMAIL_LINK' };

const DeclarationAuditAction = {
  REQUESTED: 'REQUESTED',
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
  STATUS_CHANGED: 'STATUS_CHANGED',
  SIGNED: 'SIGNED',
  EXPORTED: 'EXPORTED',
  SENT: 'SENT',
  REVOKED: 'REVOKED',
};

const ContentFormat = {
  VIDEO: 'VIDEO',
  ARTICLE: 'ARTICLE',
  PODCAST: 'PODCAST',
  PDF: 'PDF',
  EBOOK: 'EBOOK',
  SCORM: 'SCORM',
  MICROLEARNING: 'MICROLEARNING',
  INFOGRAPHIC: 'INFOGRAPHIC',
  QUIZ: 'QUIZ',
  TEMPLATE: 'TEMPLATE',
  PRESENTATION: 'PRESENTATION',
  COURSE: 'COURSE',
  WEBINAR: 'WEBINAR',
  HTML5: 'HTML5',
};

const ContentAssetStatus = {
  DRAFT: 'DRAFT',
  REVIEW: 'REVIEW',
  ACTIVE: 'ACTIVE',
  DEPRECATED: 'DEPRECATED',
  ARCHIVED: 'ARCHIVED',
};

const ContentAssetLevel = {
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
  EXPERT: 'EXPERT',
};

const ContentCategory = {
  HARD_SKILLS: 'HARD_SKILLS',
  SOFT_SKILLS: 'SOFT_SKILLS',
  COMPLIANCE: 'COMPLIANCE',
  ONBOARDING: 'ONBOARDING',
  LANGUAGES: 'LANGUAGES',
  PRODUCTS: 'PRODUCTS',
  WELLBEING: 'WELLBEING',
  LEADERSHIP: 'LEADERSHIP',
  TECHNICAL: 'TECHNICAL',
  OTHER: 'OTHER',
};

const Difficulty = {
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
  EXPERT: 'EXPERT',
};

const ScenarioCategory = {
  SOFT_SKILLS: 'SOFT_SKILLS',
  SALES: 'SALES',
  CUSTOMER_SERVICE: 'CUSTOMER_SERVICE',
  ONBOARDING: 'ONBOARDING',
  COMPLIANCE: 'COMPLIANCE',
  LEADERSHIP: 'LEADERSHIP',
  SECURITY: 'SECURITY',
  NEGOTIATION: 'NEGOTIATION',
};

const AvatarSessionStatus = {
  IN_PROGRESS: 'IN_PROGRESS',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  ABANDONED: 'ABANDONED',
};

const EventType = {
  TRAINING: 'TRAINING',
  WORKSHOP: 'WORKSHOP',
  WEBINAR: 'WEBINAR',
  LIVE_CLASS: 'LIVE_CLASS',
  HACKATHON: 'HACKATHON',
  MENTORING: 'MENTORING',
  CORPORATE: 'CORPORATE',
  ONBOARDING: 'ONBOARDING',
  NETWORKING: 'NETWORKING',
  EXTERNAL: 'EXTERNAL',
  TALK: 'TALK',
};

const EventModalidade = { ONLINE: 'ONLINE', PRESENCIAL: 'PRESENCIAL', HYBRID: 'HYBRID' };

const EventParticipantStatus = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  WAITLIST: 'WAITLIST',
  PRESENT: 'PRESENT',
  ABSENT: 'ABSENT',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
};

const InstructorType = {
  MASTER: 'MASTER',
  SENIOR: 'SENIOR',
  STANDARD: 'STANDARD',
  MENTOR: 'MENTOR',
  EXTERNAL: 'EXTERNAL',
};

const CohortModalidade = { ONLINE: 'ONLINE', PRESENCIAL: 'PRESENCIAL', HYBRID: 'HYBRID' };

const CohortStatus = {
  DRAFT: 'DRAFT',
  OPEN: 'OPEN',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
};

const CohortParticipantStatus = { ACTIVE: 'ACTIVE' };

module.exports = {
  PrismaClient,
  Prisma,
  // Enums
  UserRole,
  CycleType,
  CycleStatus,
  ReviewType,
  ReviewStatus,
  PerformanceCategory,
  PerformanceGoalStatus,
  FeedbackType,
  DisputeStatus,
  EvaluationRequestStatus,
  LeadershipProgramLevel,
  ProgramStatus,
  ParticipantStatus,
  OneOnOneStatus,
  LeadershipClassification,
  CourseLevel,
  CourseStatus,
  ModuleStatus,
  ModuleType,
  ProgressionType,
  CompletionRule,
  LessonType,
  EnrollmentOrigin,
  QuizQuestionType,
  LearningPathLevel,
  LearningPathType,
  LearningPathStatus,
  AssignmentTarget,
  LearningPathEnrollmentStatus,
  AssessmentType,
  AssessmentStatus,
  FeedbackMode,
  QuestionType,
  AttemptStatus,
  CompetencyCategory,
  CompetencyType,
  CompetencyStatus,
  CompetencySource,
  MappingPriority,
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
  ApplicationStatus,
  VacancyType,
  VacancyStatus,
  SuccessorPriority,
  SuccessionPdiStatus,
  BusinessImpact,
  ReplacementTime,
  RiskLevel,
  PlanPriority,
  PlanStatus,
  ActionType,
  ActionStatus,
  EvidenceType,
  CheckinType,
  CheckpointStatus,
  ApprovalDecision,
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
  OnboardingStatus,
  TaskCategory,
  TaskType,
  TaskStatus,
  TaskPhase,
  ResponsibleRole,
  DocumentStatus,
  SurveyMilestone,
  ContentType,
  ContentLevel,
  ContentStatus,
  MicroLearningAction,
  TrainingType,
  TrainingLevel,
  TrainingStatus,
  TrainingParticipantStatus,
  SessionModality,
  ArticleStatus,
  ArticleAccess,
  InteractionAction,
  ProcessStatus,
  StepType,
  InstanceStatus,
  StepProgressStatus,
  NotificationPriority,
  NotificationCategory,
  DigestFrequency,
  AuditStatus,
  AutomationCategory,
  ExecutionStatus,
  AuthType,
  SyncLogStatus,
  ApiCallStatus,
  MobileSyncStatus,
  ReportType,
  ExecutiveReportStatus,
  ReportConfidentiality,
  KpiStatus,
  PayslipAccessAction,
  DayPeriod,
  LeaveDecision,
  JustificationStatus,
  LegacyCareerPlanStatus,
  LegacyPdiStatus,
  EmployeeDocumentStatus,
  SignerRole,
  AccessMethod,
  DeclarationAuditAction,
  ContentFormat,
  ContentAssetStatus,
  ContentAssetLevel,
  ContentCategory,
  Difficulty,
  ScenarioCategory,
  AvatarSessionStatus,
  EventType,
  EventModalidade,
  EventParticipantStatus,
  InstructorType,
  CohortModalidade,
  CohortStatus,
  CohortParticipantStatus,
};
