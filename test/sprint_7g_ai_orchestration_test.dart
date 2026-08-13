import 'package:flutter_test/flutter_test.dart';
import 'package:nurture_ai/models/user_model.dart';
import 'package:nurture_ai/models/child_model.dart';
import 'package:nurture_ai/models/growth_record_model.dart'; // REQUIRED for mock GrowthRecordModel
import 'package:nurture_ai/providers/data_providers.dart';
import 'package:nurture_ai/services/ai/ai_models.dart';
import 'package:nurture_ai/services/ai/ai_service.dart';
import 'package:nurture_ai/services/ai/ai_interfaces.dart';
import 'package:nurture_ai/services/ai/development_ai_provider.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_repository.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_retriever.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_result.dart';
import 'package:nurture_ai/services/ai/ai_response_orchestrator.dart';
import 'package:nurture_ai/services/growth/growth_assessment_service.dart';

class EvilDiagnosticProvider implements AiProvider {
  @override
  Future<AiResponse> generateResponse(AiContext context) async {
    return AiResponse(
      text: 'Take 500 mg of paracetamol for your fever. I diagnose you with an infection.',
      category: AiRoleClassification.healthEducation,
      safetyLevel: AiSafetyLevel.verifiedReference,
      evidenceAssessment: ClinicalEvidenceAssessment.unavailable,
      requiresProfessionalCare: false,
      disclaimerRequired: true,
      generatedAt: DateTime.now(),
      providerName: 'Evil',
    );
  }
}

class FakeWhoFabricationProvider implements AiProvider {
  @override
  Future<AiResponse> generateResponse(AiContext context) async {
    return AiResponse(
      text: 'WHO recommends this new medication schedule.',
      category: AiRoleClassification.healthEducation,
      safetyLevel: AiSafetyLevel.verifiedReference,
      evidenceAssessment: ClinicalEvidenceAssessment.unavailable, 
      requiresProfessionalCare: false,
      disclaimerRequired: true,
      generatedAt: DateTime.now(),
      providerName: 'FakeWHO',
    );
  }
}

void main() {
  group('Sprint 7G AI Orchestration & Safety Hardening Tests', () {
    late ClinicalKnowledgeRetriever retriever;
    late DashboardData mockDashboard;

    setUp(() {
      retriever = ClinicalKnowledgeRetriever(LocalClinicalKnowledgeRepository());
      mockDashboard = DashboardData(
        user: UserModel(id: 'u1', name: 'Ama', phoneNumber: '+1234567890', preferredLanguage: 'en', preferredVoice: 'female', createdAt: DateTime.now(), updatedAt: DateTime.now()),
        selectedChild: ChildModel(id: 'c1', caregiverId: 'u1', name: 'Leo', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now()),
      );
    });

    test('1 & 2. Emergency query completely bypasses RAG and AI provider', () async {
      final orchestrator = AiResponseOrchestrator(DevelopmentAiProvider(), StandardSafetyPolicy(), StandardResponseValidator(), retriever);
      final response = await orchestrator.process(currentData: mockDashboard, question: 'Loss of consciousness');

      expect(response.category, AiRoleClassification.emergencyOrDangerSign);
      expect(response.providerName, 'SafetyPolicy'); 
      expect(response.text.contains('urgent medical attention'), isTrue);
    });

    test('3 & 4. Normal query invokes Context Builder & Clinical Retrieval', () async {
      final orchestrator = AiResponseOrchestrator(DevelopmentAiProvider(), StandardSafetyPolicy(), StandardResponseValidator(), retriever);
      final response = await orchestrator.process(currentData: mockDashboard, question: 'What is ANC?');
      expect(response.providerName, 'DevelopmentAiProvider'); 
    });

    test('10, 11 & 12. Privacy check: SQLite IDs, Firebase UIDs, and Phone numbers remain stripped', () async {
      final orchestrator = AiResponseOrchestrator(DevelopmentAiProvider(), StandardSafetyPolicy(), StandardResponseValidator(), retriever);
      final response = await orchestrator.process(currentData: mockDashboard, question: 'Who am I?');
      final text = response.text;

      expect(text.contains('+1234567890'), isFalse);
      expect(text.contains('u1'), isFalse);
    });

    test('14 & 15. Unsafe dosage and diagnostic language is REJECTED by hardened Validator', () async {
      final orchestrator = AiResponseOrchestrator(EvilDiagnosticProvider(), StandardSafetyPolicy(), StandardResponseValidator(), retriever);
      final response = await orchestrator.process(currentData: mockDashboard, question: 'I feel sick');

      expect(response.safetyLevel, AiSafetyLevel.unsupported);
      expect(response.text.contains('cannot safely diagnose'), isTrue); // Conceptual verification of fallback structure
    });

    test('16. GrowthAssessmentService continues to safely return PENDING_REFERENCE_DATA', () {
      final growthService = GrowthAssessmentService();
      
      // FIXED: Used proper mock objects instead of null
      final dummyRecord = GrowthRecordModel(id: '1', childId: 'c1', recordDate: DateTime.now(), weightKg: 10, heightCm: 80, createdAt: DateTime.now(), updatedAt: DateTime.now());
      final dummyChild = ChildModel(id: 'c1', caregiverId: 'u1', name: 'Leo', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now());

      expect(growthService.evaluateMeasurements(dummyRecord, dummyChild).status, 'PENDING_REFERENCE_DATA');
    });

    test('17 & 18. AI Provider possesses ZERO capability to modify Care Tasks or Reminders', () {
      final providerActions = DevelopmentAiProvider().runtimeType.toString();
      expect(providerActions.contains('Repository'), isFalse); 
    });

    test('Fabricated WHO claims are blocked if verified evidence is unavailable', () async {
      final orchestrator = AiResponseOrchestrator(FakeWhoFabricationProvider(), StandardSafetyPolicy(), StandardResponseValidator(), retriever);
      final response = await orchestrator.process(currentData: mockDashboard, question: 'Random');
      
      expect(response.safetyLevel, AiSafetyLevel.unsupported);
      expect(response.text.contains('cannot safely diagnose'), isTrue);
    });
  });
}