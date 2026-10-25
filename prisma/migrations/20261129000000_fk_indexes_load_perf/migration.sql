-- Índices em colunas FK usadas em joins/filtros (auditoria de performance).
-- Colunas de actor de auditoria (createdById, uploadedById, ...) ficam de fora de propósito.
-- IF NOT EXISTS: a BD de dev partilhada pode já ter alguns.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_positionId_idx" ON "User"("positionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Questions_userId_idx" ON "Questions"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Answers_userId_idx" ON "Answers"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Answers_questionId_idx" ON "Answers"("questionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserPermission_permissionId_idx" ON "UserPermission"("permissionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Department_headId_idx" ON "Department"("headId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Department_deputyHeadId_idx" ON "Department"("deputyHeadId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Department_directManagerId_idx" ON "Department"("directManagerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Department_unitId_idx" ON "Department"("unitId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Department_processOwnerDepartmentId_idx" ON "Department"("processOwnerDepartmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DepartmentHeadHistory_departmentId_idx" ON "DepartmentHeadHistory"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DepartmentHeadHistory_headId_idx" ON "DepartmentHeadHistory"("headId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DepartmentTransferLog_fromDepartmentId_idx" ON "DepartmentTransferLog"("fromDepartmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Position_reportsToPositionId_idx" ON "Position"("reportsToPositionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrgChangeLog_fromDepartmentId_idx" ON "OrgChangeLog"("fromDepartmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrgChangeLog_toDepartmentId_idx" ON "OrgChangeLog"("toDepartmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrgChangeLog_fromPositionId_idx" ON "OrgChangeLog"("fromPositionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrgChangeLog_toPositionId_idx" ON "OrgChangeLog"("toPositionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserCareerPlan_currentRoleId_idx" ON "UserCareerPlan"("currentRoleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserCareerPlan_targetRoleId_idx" ON "UserCareerPlan"("targetRoleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserCareerPlan_careerPathId_idx" ON "UserCareerPlan"("careerPathId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserCareerPlan_mentorId_idx" ON "UserCareerPlan"("mentorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CareerRole_parentRoleId_idx" ON "CareerRole"("parentRoleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CareerPathStep_roleId_idx" ON "CareerPathStep"("roleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CareerPathStep_positionId_idx" ON "CareerPathStep"("positionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InternalVacancy_positionId_idx" ON "InternalVacancy"("positionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProgressionRule_toRoleId_idx" ON "ProgressionRule"("toRoleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CareerGoal_skillId_idx" ON "CareerGoal"("skillId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionRequest_targetRoleId_idx" ON "PromotionRequest"("targetRoleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PromotionRequest_careerPlanId_idx" ON "PromotionRequest"("careerPlanId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SuccessionPlan_positionId_idx" ON "SuccessionPlan"("positionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TalentPool_mentorId_idx" ON "TalentPool"("mentorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PdiApproval_approverId_idx" ON "PdiApproval"("approverId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Course_departmentId_idx" ON "Course"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ModuleCompetency_competencyId_idx" ON "ModuleCompetency"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ModuleMaterial_moduleId_idx" ON "ModuleMaterial"("moduleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Certificate_programId_idx" ON "Certificate"("programId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Certificate_developmentPlanId_idx" ON "Certificate"("developmentPlanId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Certificate_eventId_idx" ON "Certificate"("eventId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "QuizQuestion_quizId_idx" ON "QuizQuestion"("quizId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CourseCompetency_competencyId_idx" ON "CourseCompetency"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CourseFeedback_userId_idx" ON "CourseFeedback"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LearningPathCourse_courseId_idx" ON "LearningPathCourse"("courseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LearningPathMilestone_learningPathId_idx" ON "LearningPathMilestone"("learningPathId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Assessment_moduleId_idx" ON "Assessment"("moduleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AssessmentAttemptAnswer_questionId_idx" ON "AssessmentAttemptAnswer"("questionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Competency_ownerId_idx" ON "Competency"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyModel_ownerId_idx" ON "CompetencyModel"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyModelItem_competencyId_idx" ON "CompetencyModelItem"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserCompetency_competencyId_idx" ON "UserCompetency"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyEndorsement_userId_idx" ON "CompetencyEndorsement"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CompetencyEndorsement_competencyId_idx" ON "CompetencyEndorsement"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PositionCompetency_positionId_idx" ON "PositionCompetency"("positionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PositionCompetency_careerPositionId_idx" ON "PositionCompetency"("careerPositionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PositionCompetency_competencyId_idx" ON "PositionCompetency"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceReview_reviewerId_idx" ON "PerformanceReview"("reviewerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceReview_cycleId_idx" ON "PerformanceReview"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceGoal_cycleId_idx" ON "PerformanceGoal"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoalEvaluation_goalId_idx" ON "GoalEvaluation"("goalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContinuousFeedback_giverId_idx" ON "ContinuousFeedback"("giverId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ContinuousFeedback_cycleId_idx" ON "ContinuousFeedback"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationLog_reviewId_idx" ON "CalibrationLog"("reviewId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CalibrationLog_calibratorId_idx" ON "CalibrationLog"("calibratorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceDispute_reviewId_idx" ON "PerformanceDispute"("reviewId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PerformanceDispute_userId_idx" ON "PerformanceDispute"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "NineBoxPlacement_cycleId_idx" ON "NineBoxPlacement"("cycleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OneOnOne_subordinateId_idx" ON "OneOnOne"("subordinateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeadershipFeedback360Response_feedbackId_idx" ON "LeadershipFeedback360Response"("feedbackId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MentoringSession_mentoringId_idx" ON "MentoringSession"("mentoringId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Kudos_senderId_idx" ON "Kudos"("senderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingTemplate_positionId_idx" ON "OnboardingTemplate"("positionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingTemplate_departmentId_idx" ON "OnboardingTemplate"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingTemplate_unitId_idx" ON "OnboardingTemplate"("unitId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingPlan_templateId_idx" ON "OnboardingPlan"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingPlan_buddyId_idx" ON "OnboardingPlan"("buddyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingPlan_managerId_idx" ON "OnboardingPlan"("managerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingPlan_hrResponsibleId_idx" ON "OnboardingPlan"("hrResponsibleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingTaskInstance_templateTaskId_idx" ON "OnboardingTaskInstance"("templateTaskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingDocument_planId_idx" ON "OnboardingDocument"("planId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OnboardingCheckin_responsibleId_idx" ON "OnboardingCheckin"("responsibleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MicroLearning_authorId_idx" ON "MicroLearning"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MicroQuizQuestion_microLearningId_idx" ON "MicroQuizQuestion"("microLearningId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MicroLearningProgress_microLearningId_idx" ON "MicroLearningProgress"("microLearningId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MicroQuizAttempt_userId_idx" ON "MicroQuizAttempt"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MicroQuizAttempt_microLearningId_idx" ON "MicroQuizAttempt"("microLearningId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MicroLearningPlaylist_authorId_idx" ON "MicroLearningPlaylist"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PlaylistItem_microLearningId_idx" ON "PlaylistItem"("microLearningId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Training_instructorId_idx" ON "Training"("instructorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrainingPlan_responsibleId_idx" ON "TrainingPlan"("responsibleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrainingPlan_approverId_idx" ON "TrainingPlan"("approverId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrainingParticipant_trainingId_idx" ON "TrainingParticipant"("trainingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrainingResource_responsibleId_idx" ON "TrainingResource"("responsibleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeArticle_categoryId_idx" ON "KnowledgeArticle"("categoryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ArticleRating_articleId_idx" ON "ArticleRating"("articleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ArticleComment_authorId_idx" ON "ArticleComment"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ArticleComment_parentId_idx" ON "ArticleComment"("parentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ArticleVersion_authorId_idx" ON "ArticleVersion"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ArticleAcknowledgement_articleId_idx" ON "ArticleAcknowledgement"("articleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessStandard_ownerId_idx" ON "ProcessStandard"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessStandard_departmentId_idx" ON "ProcessStandard"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessStep_responsibleId_idx" ON "ProcessStep"("responsibleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessStep_reviewerId_idx" ON "ProcessStep"("reviewerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessInstance_unitId_idx" ON "ProcessInstance"("unitId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessInstance_initiatedById_idx" ON "ProcessInstance"("initiatedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessInstance_targetUserId_idx" ON "ProcessInstance"("targetUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StepProgress_stepId_idx" ON "StepProgress"("stepId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StepProgress_reviewerId_idx" ON "StepProgress"("reviewerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessStepComment_stepId_idx" ON "ProcessStepComment"("stepId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessStepComment_authorId_idx" ON "ProcessStepComment"("authorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessApproval_stepId_idx" ON "ProcessApproval"("stepId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessApproval_requesterId_idx" ON "ProcessApproval"("requesterId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessVersion_processId_idx" ON "ProcessVersion"("processId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessApprovalLog_processId_idx" ON "ProcessApprovalLog"("processId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProcessApprovalLog_userId_idx" ON "ProcessApprovalLog"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayslipDispute_payslipId_idx" ON "PayslipDispute"("payslipId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PayslipDispute_userId_idx" ON "PayslipDispute"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmployeeCompensationComponent_compensationId_idx" ON "EmployeeCompensationComponent"("compensationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkDeclaration_userId_idx" ON "WorkDeclaration"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BadgeAward_userPointsId_idx" ON "BadgeAward"("userPointsId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Document_categoryId_idx" ON "Document"("categoryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Document_elaboratedById_idx" ON "Document"("elaboratedById");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Document_approverId_idx" ON "Document"("approverId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Document_supersedesId_idx" ON "Document"("supersedesId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Document_relatedDocumentId_idx" ON "Document"("relatedDocumentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DocShareLink_documentId_idx" ON "DocShareLink"("documentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveClass_lessonId_idx" ON "LiveClass"("lessonId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveClass_coInstructorId_idx" ON "LiveClass"("coInstructorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveClassSession_instructorId_idx" ON "LiveClassSession"("instructorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveAttendance_userId_idx" ON "LiveAttendance"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LiveChatMessage_userId_idx" ON "LiveChatMessage"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PostClassResponse_userId_idx" ON "PostClassResponse"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstructorCohort_courseId_idx" ON "InstructorCohort"("courseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstructorCourse_marketplaceCourseId_idx" ON "InstructorCourse"("marketplaceCourseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstructorReview_userId_idx" ON "InstructorReview"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "InstructorPayout_instructorId_idx" ON "InstructorPayout"("instructorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "MarketplaceCourse_instructorId_idx" ON "MarketplaceCourse"("instructorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "automation_rules_tenantId_idx" ON "automation_rules"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "sla_configs_tenantId_idx" ON "sla_configs"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReportApproval_approverId_idx" ON "ReportApproval"("approverId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExecutiveAlertRule_ownerId_idx" ON "ExecutiveAlertRule"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExecutiveAlertEvent_userId_idx" ON "ExecutiveAlertEvent"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExecutiveKPIDefinition_ownerId_idx" ON "ExecutiveKPIDefinition"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExecutiveSnapshot_organizationId_idx" ON "ExecutiveSnapshot"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "integration_configs_tenantId_idx" ON "integration_configs"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "integration_sync_logs_integrationId_idx" ON "integration_sync_logs"("integrationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OperationalMetric_unitId_idx" ON "OperationalMetric"("unitId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrainingImpact_courseId_idx" ON "TrainingImpact"("courseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiTutorSession_enrollmentId_idx" ON "AiTutorSession"("enrollmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EventFeedback_userId_idx" ON "EventFeedback"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LeaveDocument_requestId_idx" ON "LeaveDocument"("requestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceJustification_userId_idx" ON "AttendanceJustification"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceJustification_recordId_idx" ON "AttendanceJustification"("recordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AttendanceAdjustment_recordId_idx" ON "AttendanceAdjustment"("recordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserSchedule_scheduleId_idx" ON "UserSchedule"("scheduleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OvertimeRecord_attendanceId_idx" ON "OvertimeRecord"("attendanceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmployeeSkill_assessorId_idx" ON "EmployeeSkill"("assessorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmployeeSkill_skillId_idx" ON "EmployeeSkill"("skillId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Contract_employeeId_idx" ON "Contract"("employeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CareerPlan_employeeId_idx" ON "CareerPlan"("employeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LegacyPdiAction_pdiId_idx" ON "LegacyPdiAction"("pdiId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Evaluation_employeeId_idx" ON "Evaluation"("employeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Skill_categoryId_idx" ON "Skill"("categoryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoleSkillRequirement_skillId_idx" ON "RoleSkillRequirement"("skillId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "RoleSkillRequirement_careerRoleId_idx" ON "RoleSkillRequirement"("careerRoleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LegacyEmployeeSkill_employeeId_idx" ON "LegacyEmployeeSkill"("employeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SkillAssessmentHistory_skillId_idx" ON "SkillAssessmentHistory"("skillId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "declarations_templateId_idx" ON "declarations"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "declarations_assignedToId_idx" ON "declarations"("assignedToId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "declarations_employeeId_idx" ON "declarations"("employeeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "declaration_signatures_signerId_idx" ON "declaration_signatures"("signerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "declaration_attachments_declarationId_idx" ON "declaration_attachments"("declarationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "declaration_templates_tenantId_idx" ON "declaration_templates"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeclarationRequest_templateId_idx" ON "DeclarationRequest"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeclarationRequest_purposeId_idx" ON "DeclarationRequest"("purposeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DeclarationApproval_reviewerId_idx" ON "DeclarationApproval"("reviewerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkDeclAnswer_userId_idx" ON "WorkDeclAnswer"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkDeclAnswer_questionId_idx" ON "WorkDeclAnswer"("questionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WorkDeclReview_reviewerId_idx" ON "WorkDeclReview"("reviewerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BeneficiaryInteraction_userId_idx" ON "BeneficiaryInteraction"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BeneficiaryInteraction_relatedBeneficiaryId_idx" ON "BeneficiaryInteraction"("relatedBeneficiaryId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerProgram_responsibleId_idx" ON "PartnerProgram"("responsibleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerAgreement_responsibleId_idx" ON "PartnerAgreement"("responsibleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerInteraction_userId_idx" ON "PartnerInteraction"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerOpportunity_responsibleId_idx" ON "PartnerOpportunity"("responsibleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PartnerDocument_responsibleId_idx" ON "PartnerDocument"("responsibleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Funder_financialManagerId_idx" ON "Funder"("financialManagerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Funder_technicalManagerId_idx" ON "Funder"("technicalManagerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FunderProgram_responsibleId_idx" ON "FunderProgram"("responsibleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FunderOpportunity_responsibleId_idx" ON "FunderOpportunity"("responsibleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FunderInteraction_userId_idx" ON "FunderInteraction"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FunderContract_responsibleId_idx" ON "FunderContract"("responsibleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FunderContract_funderContactId_idx" ON "FunderContract"("funderContactId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LibraryItem_unitId_idx" ON "LibraryItem"("unitId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LibraryItem_approverId_idx" ON "LibraryItem"("approverId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LibraryRating_userId_idx" ON "LibraryRating"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IssuedCertificate_templateId_idx" ON "IssuedCertificate"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "LmsLiveSession_instructorId_idx" ON "LmsLiveSession"("instructorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserEvaluation_evaluatorId_idx" ON "UserEvaluation"("evaluatorId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvaluationCampaign_templateId_idx" ON "EvaluationCampaign"("templateId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvaluationCampaign_formId_idx" ON "EvaluationCampaign"("formId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvaluationCampaignQuestion_competencyId_idx" ON "EvaluationCampaignQuestion"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvaluationCriteria_scaleId_idx" ON "EvaluationCriteria"("scaleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvaluationCriteria_competencyId_idx" ON "EvaluationCriteria"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvaluationTemplate_scaleId_idx" ON "EvaluationTemplate"("scaleId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvaluationTemplateCriteria_criteriaId_idx" ON "EvaluationTemplateCriteria"("criteriaId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Recognition_badgeId_idx" ON "Recognition"("badgeId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EngagementAction_departmentId_idx" ON "EngagementAction"("departmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Eval360CycleCompetency_competencyId_idx" ON "Eval360CycleCompetency"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Eval360QuestionnaireCompetency_competencyId_idx" ON "Eval360QuestionnaireCompetency"("competencyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EvaluationAnswer_questionId_idx" ON "EvaluationAnswer"("questionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AvatarTrainingSession_avatarId_idx" ON "AvatarTrainingSession"("avatarId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AvatarTrainingAssignment_enrollmentId_idx" ON "AvatarTrainingAssignment"("enrollmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AvatarTrainingAssessment_assessmentId_idx" ON "AvatarTrainingAssessment"("assessmentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FunderDocument_responsibleId_idx" ON "FunderDocument"("responsibleId");

