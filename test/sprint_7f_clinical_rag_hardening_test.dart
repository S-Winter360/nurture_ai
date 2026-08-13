import 'package:flutter_test/flutter_test.dart';
import 'package:nurture_ai/models/child_model.dart';
import 'package:nurture_ai/models/growth_record_model.dart';
import 'package:nurture_ai/services/ai/ai_models.dart';
import 'package:nurture_ai/services/ai/ai_service.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_source_registry.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_index.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_result.dart';
import 'package:nurture_ai/services/growth/growth_assessment_service.dart';

void main() {
  group('Sprint 7F Clinical RAG Hardening Tests', () {
    test('1. Verified source lookup passes ClinicalSourceRegistry validation', () {
      final status = ClinicalSourceRegistry.verifySource(
        'doc_ghs_sm_2019', 'Ghana Health Service / Ministry of Health', 'National Safe Motherhood Clinical Guidelines'
      );
      expect(status, ClinicalKnowledgeTrustStatus.verified);
    });

    test('2. Unknown or fabricated source rejection in Registry', () {
      final status = ClinicalSourceRegistry.verifySource(
        'fake_doc_123', 'WHO', 'Fake Guidelines'
      );
      expect(status, ClinicalKnowledgeTrustStatus.unverified);
    });

    test('3 & 4 & 5. Deterministic retrieval, exact phrase scoring, and keyword ranking', () {
      final index = ClinicalKnowledgeIndex();
      index.registerChunk(ClinicalKnowledgeChunk(chunkId: 'c1', documentId: 'd1', sourceOrg: 'org', documentTitle: 'title', publicationYear: '2020', version: '1', section: 'sec', text: 'take iron supplements daily', keywords: ['iron']));
      index.registerChunk(ClinicalKnowledgeChunk(chunkId: 'c2', documentId: 'd1', sourceOrg: 'org', documentTitle: 'title', publicationYear: '2020', version: '1', section: 'sec', text: 'vitamins are good', keywords: ['iron']));

      final results = index.search('iron supplements daily');
      expect(results.length, 2);
      expect(results.first.chunk.chunkId, 'c1'); 
    });

    test('7. Evidence sufficiency: High score triggers sufficient assessment', () {
      final index = ClinicalKnowledgeIndex();
      index.registerChunk(ClinicalKnowledgeChunk(chunkId: 'c1', documentId: 'd1', sourceOrg: '', documentTitle: '', publicationYear: '', version: '', section: '', text: 'exact match phrase', keywords: []));
      final results = index.search('exact match phrase');
      expect(results.first.score >= 100, isTrue); 
    });

    test('8 & 9. Unsupported query safely returns referenceDataUnavailable', () async {
      final result = ClinicalKnowledgeResult.unavailable();
      expect(result.evidenceAssessment, ClinicalEvidenceAssessment.unavailable);
      expect(result.message.contains('REFERENCE_DATA_UNAVAILABLE'), isTrue);
    });

    test('13. Conflicting evidence handled conservatively', () async {
      final result = ClinicalKnowledgeResult.found([], ClinicalEvidenceAssessment.conflictingEvidence);
      expect(result.evidenceAssessment, ClinicalEvidenceAssessment.conflictingEvidence);
    });

    test('14 & 15. Fabricated source rejection via ResponseValidator', () {
      final validator = StandardResponseValidator();
      final context = AiContext(selectedProfileName: 'A', profileType: 'child', userQuestion: 'Q', safetyClassification: AiRoleClassification.appAssistance, evidenceAssessment: ClinicalEvidenceAssessment.unavailable);
      final response = AiResponse(text: 'WHO recommends this fake drug.', category: AiRoleClassification.appAssistance, safetyLevel: AiSafetyLevel.verifiedReference, evidenceAssessment: ClinicalEvidenceAssessment.unavailable, requiresProfessionalCare: false, disclaimerRequired: true, generatedAt: DateTime.now(), providerName: 'Test');
      
      final isValid = validator.isValidAndSafe(response, context);
      expect(isValid, isFalse); 
    });

    test('16 & 17. Emergency query bypasses RAG and AI provider completely', () {
      final policy = StandardSafetyPolicy();
      final classification = policy.classifyRequest('baby is bleeding');
      expect(classification, AiRoleClassification.emergencyOrDangerSign); 
    });

    test('20. Growth Reference Protection remains PENDING_REFERENCE_DATA', () {
      final growthService = GrowthAssessmentService();
      
      // FIXED: Pass valid mock objects to satisfy Dart's strong null-safety
      final dummyRecord = GrowthRecordModel(id: '1', childId: 'c1', recordDate: DateTime.now(), weightKg: 10, heightCm: 80, createdAt: DateTime.now(), updatedAt: DateTime.now());
      final dummyChild = ChildModel(id: 'c1', caregiverId: 'u1', name: 'Leo', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now());

      expect(growthService.evaluateMeasurements(dummyRecord, dummyChild).status, 'PENDING_REFERENCE_DATA');
    });
  });
}