import '../../models/clinical_reference_model.dart';
import 'clinical/clinical_knowledge_result.dart';

enum AiRoleClassification {
  appAssistance, healthEducation, generalEducation, carePlanExplanation,
  recordExplanation, safetyEscalation, unsupportedClinicalRequest, emergencyOrDangerSign,
}

enum AiSafetyLevel {
  verifiedReference, appData, generalEducation, limited, unsupported,
}

class AiContext {
  final String selectedProfileName;
  final String profileType; 
  final int? pregnancyWeek;
  final int? childAgeMonths;
  final List<String> upcomingTaskTitles;
  final List<String> recentVaccinations;
  final List<ClinicalReferenceModel> relevantReferences;
  final ClinicalEvidenceAssessment evidenceAssessment; 
  final String userQuestion;
  final AiRoleClassification safetyClassification;

  AiContext({
    required this.selectedProfileName, required this.profileType,
    this.pregnancyWeek, this.childAgeMonths,
    this.upcomingTaskTitles = const [], this.recentVaccinations = const [],
    this.relevantReferences = const [], required this.evidenceAssessment,
    required this.userQuestion, required this.safetyClassification,
  });
}

class AiResponse {
  final String text;
  final AiRoleClassification category;
  final AiSafetyLevel safetyLevel;
  final ClinicalEvidenceAssessment evidenceAssessment; 
  final List<ClinicalReferenceModel> sources; 
  final bool requiresProfessionalCare;
  final bool disclaimerRequired; 
  final DateTime generatedAt;
  final String providerName;

  // SPRINT 7G: Added getter for fallback validation
  bool get isFallback => safetyLevel == AiSafetyLevel.unsupported;

  AiResponse({
    required this.text, required this.category, required this.safetyLevel,
    required this.evidenceAssessment, this.sources = const [],
    required this.requiresProfessionalCare, required this.disclaimerRequired,
    required this.generatedAt, required this.providerName,
  });

  factory AiResponse.fallback(String message) {
    return AiResponse(
      text: message, category: AiRoleClassification.unsupportedClinicalRequest,
      safetyLevel: AiSafetyLevel.unsupported,
      evidenceAssessment: ClinicalEvidenceAssessment.unavailable,
      requiresProfessionalCare: true, disclaimerRequired: true,
      generatedAt: DateTime.now(), providerName: 'SystemFallback',
    );
  }
}