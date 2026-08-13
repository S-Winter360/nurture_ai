import 'clinical_knowledge_repository.dart';
import 'clinical_knowledge_result.dart';

class ClinicalKnowledgeRetriever {
  final ClinicalKnowledgeRepository repository;

  ClinicalKnowledgeRetriever(this.repository);

  Future<ClinicalKnowledgeResult> retrieveKnowledge(String query) async {
    final scoredResults = await repository.searchScored(query);
    
    if (scoredResults.isEmpty) {
      return ClinicalKnowledgeResult.unavailable();
    }

    final highestScore = scoredResults.first.score;
    ClinicalEvidenceAssessment assessment;
    
    if (highestScore >= 100) {
      assessment = ClinicalEvidenceAssessment.sufficient;
    } else if (highestScore > 0) {
      assessment = ClinicalEvidenceAssessment.insufficient;
    } else {
      assessment = ClinicalEvidenceAssessment.unavailable;
    }

    final uniqueSources = scoredResults.map((s) => s.chunk.documentId).toSet();
    if (assessment == ClinicalEvidenceAssessment.sufficient && uniqueSources.length > 1) {
      assessment = ClinicalEvidenceAssessment.conflictingEvidence;
    }

    final references = scoredResults.map((s) => s.chunk.toReferenceModel()).toList();

    return ClinicalKnowledgeResult.found(references, assessment);
  }
}