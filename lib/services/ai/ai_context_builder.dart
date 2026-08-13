import '../../providers/data_providers.dart';
import '../../utils/gestational_age.dart';
import 'clinical/clinical_knowledge_result.dart';
import 'ai_models.dart';

class AiContextBuilder {
  static AiContext buildContext({
    required DashboardData dashboardData,
    required String userQuestion,
    required AiRoleClassification classification,
    required ClinicalKnowledgeResult retrievalResult,
  }) {
    final isChild = dashboardData.selectedChild != null;
    final profileName = isChild ? dashboardData.selectedChild!.name : (dashboardData.mother?.name ?? 'User');
    int? pregWeek;
    if (!isChild && dashboardData.activePregnancy != null) {
      pregWeek = GestationalAge.fromLMP(dashboardData.activePregnancy!.lastMenstrualPeriod).displayWeek;
    }
    int? childAge = isChild ? dashboardData.selectedChild!.ageInMonths : null;

    final relevantTasks = isChild ? dashboardData.childTasks : dashboardData.maternalTasks;
    final taskTitles = relevantTasks.where((t) => t.status == 'due' || t.status == 'pending').map((t) => t.title).toList();

    // SPRINT 7F: Build Strict Evaluation Prompt Instructions
    String safetyInstruction = "";
    if (retrievalResult.evidenceAssessment == ClinicalEvidenceAssessment.unavailable) {
      safetyInstruction = "Verified local clinical reference information is unavailable for this question. Do not invent or attribute clinical guidance to WHO/GHS.";
    } else if (retrievalResult.evidenceAssessment == ClinicalEvidenceAssessment.conflictingEvidence) {
      safetyInstruction = "The available local references provide conflicting or insufficient consistency. Recommend professional verification. Do not invent a single definitive answer.";
    } else {
      safetyInstruction = "Use only the supplied verified clinical evidence when making source-based clinical claims.";
    }

    return AiContext(
      selectedProfileName: profileName, profileType: isChild ? 'child' : 'mother',
      pregnancyWeek: pregWeek, childAgeMonths: childAge,
      upcomingTaskTitles: taskTitles,
      userQuestion: "$userQuestion\n\nSYSTEM DIRECTIVE: $safetyInstruction",
      safetyClassification: classification,
      relevantReferences: retrievalResult.references,
      evidenceAssessment: retrievalResult.evidenceAssessment,
    );
  }
}