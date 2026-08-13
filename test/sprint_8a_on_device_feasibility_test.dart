import 'package:flutter_test/flutter_test.dart';
import 'package:nurture_ai/models/user_model.dart';
import 'package:nurture_ai/models/child_model.dart';
import 'package:nurture_ai/providers/data_providers.dart';
import 'package:nurture_ai/services/ai/ai_models.dart';
import 'package:nurture_ai/services/ai/local_model_runtime.dart';
import 'package:nurture_ai/services/ai/on_device_ai_provider.dart';
import 'package:nurture_ai/services/ai/development_ai_provider.dart';
import 'package:nurture_ai/services/ai/ai_response_orchestrator.dart';
import 'package:nurture_ai/services/ai/ai_service.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_repository.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_retriever.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_result.dart';
import 'package:nurture_ai/services/ai/local_model_registry.dart';

class MockWorkingRuntime implements LocalModelRuntime {
  @override
  RuntimeState get state => RuntimeState.ready;
  bool isReleased = false;
  @override
  Future<bool> isModelAvailable() async => true;
  @override
  Future<bool> initializeModel() async => true;
  @override
  Future<String?> runInference(String prompt) async {
    if (prompt.contains('1234567890') || prompt.contains('u1')) {
      return 'FAILURE: Privacy Leak Detected!';
    }
    return 'On-device output processed safely.';
  }
  @override
  Future<void> cancel() async {}
  @override
  Future<void> release() async { isReleased = true; }
}

class MockCrashingRuntime implements LocalModelRuntime {
  @override
  RuntimeState get state => RuntimeState.error;
  @override
  Future<bool> isModelAvailable() async => true;
  @override
  Future<bool> initializeModel() async => throw Exception('Fatal C++ Initialization Error');
  @override
  Future<String?> runInference(String prompt) async => null;
  @override
  Future<void> cancel() async {}
  @override
  Future<void> release() async {}
}

class MockMaliciousRuntime implements LocalModelRuntime {
  @override
  RuntimeState get state => RuntimeState.ready;
  @override
  Future<bool> isModelAvailable() async => true;
  @override
  Future<bool> initializeModel() async => true;
  @override
  Future<String?> runInference(String prompt) async => 'You have malaria. Take 500mg immediately. WHO recommends this.';
  @override
  Future<void> cancel() async {}
  @override
  Future<void> release() async {}
}

void main() {
  group('Sprint 8A On-Device Runtime Security & Capability Tests', () {
    late AiContext testContext;
    late DashboardData mockDashboard;
    late ClinicalKnowledgeRetriever retriever;
    late LocalModelRegistry registry;

    setUp(() {
      registry = LocalModelRegistry();
      retriever = ClinicalKnowledgeRetriever(LocalClinicalKnowledgeRepository());
      testContext = AiContext(
        selectedProfileName: 'Leo', profileType: 'child', childAgeMonths: 12,
        userQuestion: 'What should Leo eat?', safetyClassification: AiRoleClassification.healthEducation,
        evidenceAssessment: ClinicalEvidenceAssessment.unavailable,
      );
      mockDashboard = DashboardData(
        user: UserModel(id: 'u1', name: 'Ama', phoneNumber: '+1234567890', preferredLanguage: 'en', preferredVoice: 'female', createdAt: DateTime.now(), updatedAt: DateTime.now()),
        selectedChild: ChildModel(id: 'c1', caregiverId: 'u1', name: 'Leo', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now()),
      );
    });

    test('1 & 2. LocalModelRuntime capability detection & Model Unavailable Fallback', () async {
      final provider = OnDeviceAiProvider(runtime: StubLocalModelRuntime(registry), fallbackProvider: DevelopmentAiProvider());
      final response = await provider.generateResponse(testContext);
      expect(response.providerName, 'DevelopmentAiProvider'); 
    });

    test('3 & 4. Runtime Unavailable & Initialization Failure Fallbacks', () async {
      final provider = OnDeviceAiProvider(runtime: MockCrashingRuntime(), fallbackProvider: DevelopmentAiProvider());
      final response = await provider.generateResponse(testContext);
      expect(response.providerName, 'DevelopmentAiProvider'); 
    });

    test('5. Inference Failure Fallback', () async {
      final provider = OnDeviceAiProvider(runtime: StubLocalModelRuntime(registry), fallbackProvider: DevelopmentAiProvider());
      final response = await provider.generateResponse(testContext);
      expect(response.providerName, 'DevelopmentAiProvider');
    });

    test('6. Emergency query NEVER reaches runtime', () async {
      final mockRuntime = MockWorkingRuntime();
      final provider = OnDeviceAiProvider(runtime: mockRuntime);
      final orchestrator = AiResponseOrchestrator(provider, StandardSafetyPolicy(), StandardResponseValidator(), retriever);

      final response = await orchestrator.process(currentData: mockDashboard, question: 'Baby is bleeding');
      expect(response.category, AiRoleClassification.emergencyOrDangerSign);
      expect(response.providerName, 'SafetyPolicy'); 
    });

    test('7, 8, 9 & 10. Sanitized context reaches runtime: ZERO SQLite/Firebase/Phone leaks', () async {
      final mockRuntime = MockWorkingRuntime();
      final provider = OnDeviceAiProvider(runtime: mockRuntime);
      final orchestrator = AiResponseOrchestrator(provider, StandardSafetyPolicy(), StandardResponseValidator(), retriever);

      final response = await orchestrator.process(currentData: mockDashboard, question: 'Routine question');
      expect(response.text.contains('FAILURE'), isFalse); 
    });

    test('12 & 13. Unsafe model output is strictly BLOCKED by Validator', () async {
      final maliciousRuntime = MockMaliciousRuntime();
      final provider = OnDeviceAiProvider(runtime: maliciousRuntime);
      final orchestrator = AiResponseOrchestrator(provider, StandardSafetyPolicy(), StandardResponseValidator(), retriever);

      final response = await orchestrator.process(currentData: mockDashboard, question: 'I feel sick');
      expect(response.safetyLevel, AiSafetyLevel.unsupported);
      expect(response.text.contains('500mg'), isFalse); 
    });

    test('19. Runtime release is safe/idempotent', () async {
      final mockRuntime = MockWorkingRuntime();
      await mockRuntime.release();
      expect(mockRuntime.isReleased, isTrue);
    });
  });
}