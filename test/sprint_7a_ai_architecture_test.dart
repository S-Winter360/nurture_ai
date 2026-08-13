import 'package:flutter_test/flutter_test.dart';
import 'package:nurture_ai/models/user_model.dart';
import 'package:nurture_ai/models/child_model.dart';
import 'package:nurture_ai/models/care_task_model.dart';
import 'package:nurture_ai/models/growth_record_model.dart';
import 'package:nurture_ai/providers/data_providers.dart';
import 'package:nurture_ai/services/ai/ai_models.dart';
import 'package:nurture_ai/services/ai/ai_interfaces.dart'; 
import 'package:nurture_ai/services/ai/ai_context_builder.dart';
import 'package:nurture_ai/services/ai/development_ai_provider.dart';
import 'package:nurture_ai/services/ai/ai_response_orchestrator.dart'; // <--- FIXED
import 'package:nurture_ai/services/ai/ai_service.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_repository.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_retriever.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_result.dart'; 
import 'package:nurture_ai/services/growth/growth_assessment_service.dart';

void main() {
  group('Sprint 7A AI Architecture & Privacy Boundary Tests', () {
    late DashboardData mockDashboard;
    late AiResponseOrchestrator aiService; // <--- FIXED to Orchestrator

    setUp(() {
      final exactTwoMonthsAgo = DateTime(DateTime.now().year, DateTime.now().month - 2, DateTime.now().day);

      mockDashboard = DashboardData(
        user: UserModel(id: 'u1', name: 'Ama', phoneNumber: '+1234567890', preferredLanguage: 'en', preferredVoice: 'female', createdAt: DateTime.now(), updatedAt: DateTime.now()),
        selectedChild: ChildModel(id: 'c1', caregiverId: 'u1', name: 'Leo', dateOfBirth: exactTwoMonthsAgo, sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now()),
        childTasks: [CareTaskModel(id: 't1', profileId: 'c1', profileType: 'child', title: 'Vaccine Due', description: '', category: 'vax', dueDate: DateTime.now(), dueTime: '08:00', status: 'due', priority: 'high', createdAt: DateTime.now(), updatedAt: DateTime.now())],
        maternalTasks: [CareTaskModel(id: 't2', profileId: 'u1', profileType: 'mother', title: 'ANC Due', description: '', category: 'anc', dueDate: DateTime.now(), dueTime: '08:00', status: 'due', priority: 'high', createdAt: DateTime.now(), updatedAt: DateTime.now())],
      );

      final retriever = ClinicalKnowledgeRetriever(LocalClinicalKnowledgeRepository());
      
      aiService = AiResponseOrchestrator(
        DevelopmentAiProvider(),
        StandardSafetyPolicy(),
        StandardResponseValidator(),
        retriever,
      );
    });

    test('1. Privacy: AI Context STRIPS Firebase UID, User ID, and Phone Number', () {
      final context = AiContextBuilder.buildContext(
        dashboardData: mockDashboard, 
        userQuestion: 'Hello', 
        classification: AiRoleClassification.appAssistance,
        retrievalResult: ClinicalKnowledgeResult.unavailable(), 
      );
      expect(context.selectedProfileName, 'Leo');
      expect(context.childAgeMonths, 2); 
      final contextStr = context.toString();
      expect(contextStr.contains('+1234567890'), isFalse);
      expect(contextStr.contains('u1'), isFalse);
    });

    test('2. Profile Isolation: Child A context excludes Mother/Child B tasks', () {
      final context = AiContextBuilder.buildContext(
        dashboardData: mockDashboard, 
        userQuestion: 'What is due?', 
        classification: AiRoleClassification.appAssistance,
        retrievalResult: ClinicalKnowledgeResult.unavailable(), 
      );
      expect(context.upcomingTaskTitles.length, 1);
      expect(context.upcomingTaskTitles.first, 'Vaccine Due');
    });

    test('3. Danger Sign Safety: Triggers immediate emergency escalation without consulting LLM', () async {
      final response = await aiService.process(currentData: mockDashboard, question: 'My baby has a high fever and is bleeding.');
      expect(response.category, AiRoleClassification.emergencyOrDangerSign);
      expect(response.requiresProfessionalCare, isTrue);
      expect(response.text.contains('urgent medical attention'), isTrue);
    });

    test('4. Validator Safety: Hallucinated diagnosis is intercepted and sanitized', () async {
      final retriever = ClinicalKnowledgeRetriever(LocalClinicalKnowledgeRepository());
      final safeService = AiResponseOrchestrator(_EvilPrescribingAiProvider(), StandardSafetyPolicy(), StandardResponseValidator(), retriever);
      final response = await safeService.process(currentData: mockDashboard, question: 'I feel sick');
      expect(response.safetyLevel, AiSafetyLevel.unsupported);
      expect(response.text.contains('I cannot safely diagnose or prescribe'), isTrue);
    });

    test('5. Care Engine & Growth Engine remain absolutely independent of AI layer', () {
      final growthService = GrowthAssessmentService();
      final dummyRecord = GrowthRecordModel(id: '1', childId: 'c1', recordDate: DateTime.now(), weightKg: 5, heightCm: 50, createdAt: DateTime.now(), updatedAt: DateTime.now());
      final dummyChild = ChildModel(id: 'c1', caregiverId: 'u1', name: 'Leo', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now());
      expect(growthService.evaluateMeasurements(dummyRecord, dummyChild).status, 'PENDING_REFERENCE_DATA');
    });
  });
}

class _EvilPrescribingAiProvider implements AiProvider {
  @override
  Future<AiResponse> generateResponse(AiContext context) async {
    return AiResponse(
      text: 'I diagnose you with Malaria. Take dosage of 500mg immediately.',
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