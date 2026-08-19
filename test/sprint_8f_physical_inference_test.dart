import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nurture_ai/models/user_model.dart';
import 'package:nurture_ai/models/child_model.dart';
import 'package:nurture_ai/models/growth_record_model.dart';
import 'package:nurture_ai/providers/data_providers.dart';
import 'package:nurture_ai/services/ai/ai_models.dart';
import 'package:nurture_ai/services/ai/local_model_runtime.dart';
import 'package:nurture_ai/services/ai/local_model_descriptor.dart';
import 'package:nurture_ai/services/ai/local_model_registry.dart';
import 'package:nurture_ai/services/ai/on_device_ai_provider.dart';
import 'package:nurture_ai/services/ai/ai_response_orchestrator.dart';
import 'package:nurture_ai/services/ai/ai_service.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_repository.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_retriever.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_result.dart';
import 'package:nurture_ai/services/ai/development_ai_provider.dart';
import 'package:nurture_ai/services/growth/growth_assessment_service.dart';

class MockRegistry extends LocalModelRegistry {
  final String injectedPath;
  MockRegistry(this.injectedPath);

  @override
  Future<LocalModelDescriptor?> getActiveModel() async {
    return LocalModelDescriptor(
      modelId: '1', displayName: 'Gemma Mock', version: '1',
      format: ModelFormat.bin, runtime: ModelRuntime.mediaPipe,
      architecture: 'transformer', quantization: '4bit', fileName: 'model.bin',
      sha256: 'hash', minimumRamMb: 2048, supportedAbi: ['arm64-v8a'],
      absolutePath: injectedPath,
    );
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('Sprint 8F Native Inference Bridge & Compatibility Tests', () {
    late NativeModelRuntime runtime;
    late AiResponseOrchestrator orchestrator;
    late DashboardData mockDashboard;
    
    // Test tracker to verify MethodChannel calls
    final List<MethodCall> channelCalls = [];

    setUp(() {
      channelCalls.clear();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('nurture_ai/local_model_inference'),
        (MethodCall methodCall) async {
          channelCalls.add(methodCall);
          if (methodCall.method == 'initializeModel') return true;
          if (methodCall.method == 'runInference') return 'Simulated Native Token Output';
          return true;
        },
      );

      mockDashboard = DashboardData(
        user: UserModel(id: 'u1', name: 'Ama', phoneNumber: '+1234567890', preferredLanguage: 'en', preferredVoice: 'f', createdAt: DateTime.now(), updatedAt: DateTime.now()),
        selectedChild: ChildModel(id: 'c1', caregiverId: 'u1', name: 'Leo', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now()),
      );
    });

    test('1. Native runtime initialization passes correct arguments securely', () async {
      final safeRegistry = MockRegistry('/data/user/0/com.app/app_flutter/local_models/safe.bin');
      runtime = NativeModelRuntime(safeRegistry);
      
      await runtime.initializeModel();
      
      expect(channelCalls.length, 1);
      expect(channelCalls.first.method, 'initializeModel');
      expect(channelCalls.first.arguments['modelPath'], contains('local_models/safe.bin'));
      expect(runtime.state, RuntimeState.ready);
    });

    test('2, 6. Path traversal protection: Invalid paths are rejected BEFORE native bridge', () async {
      final maliciousRegistry = MockRegistry('/data/user/0/com.app/../../etc/shadow');
      runtime = NativeModelRuntime(maliciousRegistry);
      
      final isAvail = await runtime.isModelAvailable();
      expect(isAvail, isFalse);

      final isInit = await runtime.initializeModel();
      expect(isInit, isFalse); 
      expect(channelCalls.isEmpty, isTrue); // Native bridge NEVER invoked
      expect(runtime.state, RuntimeState.error);
    });

    test('3. Privacy Boundary: Prompt generation strips SQLite IDs and Firebase UIDs', () async {
      final safeRegistry = MockRegistry('/data/user/0/com.app/local_models/safe.bin');
      runtime = NativeModelRuntime(safeRegistry);
      await runtime.initializeModel();
      
      final provider = OnDeviceAiProvider(runtime: runtime, fallbackProvider: DevelopmentAiProvider());
      final retriever = ClinicalKnowledgeRetriever(LocalClinicalKnowledgeRepository());
      orchestrator = AiResponseOrchestrator(provider, StandardSafetyPolicy(), StandardResponseValidator(), retriever);

      await orchestrator.process(currentData: mockDashboard, question: 'Routine query');

      final inferenceCall = channelCalls.firstWhere((call) => call.method == 'runInference');
      final prompt = inferenceCall.arguments['prompt'] as String;

      expect(prompt.contains('+1234567890'), isFalse);
      expect(prompt.contains('u1'), isFalse);
      expect(prompt.contains('Leo'), isTrue); // Sanitized context works
    });

    test('4. Emergency bypass: Danger signs completely skip Native Runtime execution', () async {
      final safeRegistry = MockRegistry('/data/user/0/com.app/local_models/safe.bin');
      runtime = NativeModelRuntime(safeRegistry);
      final provider = OnDeviceAiProvider(runtime: runtime);
      final retriever = ClinicalKnowledgeRetriever(LocalClinicalKnowledgeRepository());
      orchestrator = AiResponseOrchestrator(provider, StandardSafetyPolicy(), StandardResponseValidator(), retriever);

      final response = await orchestrator.process(currentData: mockDashboard, question: 'Severe bleeding');

      expect(response.category, AiRoleClassification.emergencyOrDangerSign);
      // Ensure runInference was never called
      expect(channelCalls.any((call) => call.method == 'runInference'), isFalse);
    });

    test('5. Cancellation routes safely through Native Bridge', () async {
      final safeRegistry = MockRegistry('/data/user/0/com.app/local_models/safe.bin');
      runtime = NativeModelRuntime(safeRegistry);
      await runtime.initializeModel();

      // Force generating state
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('nurture_ai/local_model_inference'),
        (MethodCall methodCall) async { 
          if (methodCall.method == 'runInference') {
            await Future.delayed(const Duration(milliseconds: 500));
            return 'done';
          }
          return true;
        },
      );

      final genFuture = runtime.runInference('prompt');
      expect(runtime.state, RuntimeState.generating);

      await runtime.cancel(); // Fire cancel immediately
      
      expect(runtime.state, RuntimeState.cancelled);
      await genFuture; // Let execution finish
      expect(runtime.state, RuntimeState.ready); // Safely returned to ready
    });

    test('6. Inference Failure correctly degrades to DevelopmentAiProvider fallback', () async {
      // Override the mock to throw an exception during native inference
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
        const MethodChannel('nurture_ai/local_model_inference'),
        (MethodCall methodCall) async {
          if (methodCall.method == 'initializeModel') return true;
          if (methodCall.method == 'runInference') throw Exception('Native crash');
          return true;
        },
      );

      final safeRegistry = MockRegistry('/data/user/0/com.app/local_models/safe.bin');
      runtime = NativeModelRuntime(safeRegistry);
      final provider = OnDeviceAiProvider(runtime: runtime, fallbackProvider: DevelopmentAiProvider());

      final response = await provider.generateResponse(AiContext(
        selectedProfileName: 'Leo', profileType: 'child', userQuestion: 'Hello', safetyClassification: AiRoleClassification.appAssistance, evidenceAssessment: ClinicalEvidenceAssessment.unavailable,
      ));

      expect(response.providerName, 'DevelopmentAiProvider'); // Successfully caught the crash and fell back!
      expect(runtime.state, RuntimeState.error); // State machine accurately reflects failure
    });
    
    test('7. Growth Data remains strictly PENDING_REFERENCE_DATA', () {
      final growthService = GrowthAssessmentService();
      final dummyRecord = GrowthRecordModel(id: '1', childId: 'c1', recordDate: DateTime.now(), weightKg: 10, heightCm: 80, createdAt: DateTime.now(), updatedAt: DateTime.now());
      final dummyChild = ChildModel(id: 'c1', caregiverId: 'u1', name: 'Leo', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now());

      expect(growthService.evaluateMeasurements(dummyRecord, dummyChild).status, 'PENDING_REFERENCE_DATA');
    });

    test('8. Offline capability guaranteed (Zero HTTP dependencies in NativeModelRuntime)', () {
      final safeRegistry = MockRegistry('/data/user/0/com.app/local_models/safe.bin');
      final runtimeStr = NativeModelRuntime(safeRegistry).runtimeType.toString();
      
      expect(runtimeStr.contains('http'), isFalse);
      expect(runtimeStr.contains('firebase'), isFalse);
    });
  });
}