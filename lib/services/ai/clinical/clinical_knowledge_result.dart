import '../../../models/clinical_reference_model.dart';

enum KnowledgeRetrievalStatus {
  verifiedReferenceFound,
  referenceDataUnavailable,
  notApplicable,
}

enum ClinicalEvidenceAssessment {
  sufficient,
  insufficient,
  conflictingEvidence,
  unavailable,
}

enum ClinicalKnowledgeTrustStatus {
  verified,
  unavailable,
  unverified,
}

class ClinicalKnowledgeResult {
  final KnowledgeRetrievalStatus status;
  final ClinicalEvidenceAssessment evidenceAssessment;
  final List<ClinicalReferenceModel> references;
  final String message;

  ClinicalKnowledgeResult({
    required this.status,
    required this.evidenceAssessment,
    this.references = const [],
    required this.message,
  });

  factory ClinicalKnowledgeResult.found(List<ClinicalReferenceModel> refs, ClinicalEvidenceAssessment assessment) {
    return ClinicalKnowledgeResult(
      status: KnowledgeRetrievalStatus.verifiedReferenceFound,
      evidenceAssessment: assessment,
      references: refs,
      message: 'Verified clinical reference found.',
    );
  }

  factory ClinicalKnowledgeResult.unavailable() {
    return ClinicalKnowledgeResult(
      status: KnowledgeRetrievalStatus.referenceDataUnavailable,
      evidenceAssessment: ClinicalEvidenceAssessment.unavailable,
      references: const [],
      message: 'REFERENCE_DATA_UNAVAILABLE: No verified clinical reference matches this query in local storage.',
    );
  }
}