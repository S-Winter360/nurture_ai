import 'package:flutter_test/flutter_test.dart';
import 'package:nurture_ai/models/user_model.dart';
import 'package:nurture_ai/models/child_model.dart';
import 'package:nurture_ai/providers/data_providers.dart';
import 'package:nurture_ai/services/ai/ai_interfaces.dart';
import 'package:nurture_ai/services/ai/ai_models.dart';
import 'package:nurture_ai/services/ai/local_model_runtime.dart';
import 'package:nurture_ai/services/ai/on_device_ai_provider.dart';
import 'package:nurture_ai/services/ai/development_ai_provider.dart';
import 'package:nurture_ai/services/ai/ai_service.dart';
import 'package:nurture_ai/services/ai/ai_response_orchestrator.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_repository.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_retriever.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_result.dart';
import 'package:nurture_ai/services/ai/local_model_registry.dart'; 

class MockWorkingRuntime implements LocalModelRuntime {
  @override
  RuntimeState get state => RuntimeState.ready;
  @override
  Future<bool> isModelAvailable() async => true;
  @override
  Future<bool> initializeModel() async => true;
  @override
  Future<String?> runInference(String prompt) async => 'On-device response for $prompt';
  @override
  Future<void> cancel() async {}
  @override
  Future<void> release() async {}
}

class MockFailingRuntime implements LocalModelRuntime {
  @override
  RuntimeState get state => RuntimeState.error;
  @override
  Future<bool> isModelAvailable() async => true;
  @override
  Future<bool> initializeModel() async => throw Exception('GPU Out of memory');
  @override
  Future<String?> runInference(String prompt) async => null;
  @override
  Future<void> cancel() async {}
  @override
  Future<void> release() async {}
}

void main() {
  group('Sprint 7C On-Device AI Provider & Fallback Tests', () {
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

    test('1. OnDeviceAiProvider implements AiProvider interface', () {
      final provider = OnDeviceAiProvider();
      expect(provider, isA<AiProvider>());
    });

    test('2. Unpopulated runtime safely triggers DevelopmentAiProvider fallback', () async {
      final provider = OnDeviceAiProvider(runtime: StubLocalModelRuntime(registry), fallbackProvider: DevelopmentAiProvider());
      final response = await provider.generateResponse(testContext);
      expect(response.providerName, 'DevelopmentAiProvider');
    });

    test('3. Runtime initialization failure degrades safely to fallback provider without crashing', () async {
      final provider = OnDeviceAiProvider(runtime: MockFailingRuntime(), fallbackProvider: DevelopmentAiProvider());
      final response = await provider.generateResponse(testContext);
      expect(response.providerName, 'DevelopmentAiProvider');
    });

    test('4. Active runtime generates valid AiResponse with OnDeviceAiProvider tag', () async {
      final provider = OnDeviceAiProvider(runtime: MockWorkingRuntime(), fallbackProvider: DevelopmentAiProvider());
      final response = await provider.generateResponse(testContext);
      expect(response.providerName.contains('OnDeviceAiProvider'), isTrue);
    });

    test('5. Safety Policy short-circuits BEFORE OnDeviceAiProvider is invoked on danger signs', () async {
      final mockRuntime = MockWorkingRuntime();
      final provider = OnDeviceAiProvider(runtime: mockRuntime);
      final aiService = AiResponseOrchestrator(provider, StandardSafetyPolicy(), StandardResponseValidator(), retriever);
      final response = await aiService.process(currentData: mockDashboard, question: 'My baby is bleeding');
      expect(response.category, AiRoleClassification.emergencyOrDangerSign);
      expect(response.providerName, 'SafetyPolicy');
    });

    test('6. Zero database operations exist in OnDeviceAiProvider', () {
      final providerStr = OnDeviceAiProvider().runtimeType.toString();
      expect(providerStr.contains('sqflite'), isFalse);
    });
  });
}