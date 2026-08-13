import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/clinical_reference_model.dart';
import '../services/ai/ai_interfaces.dart';
import '../services/ai/development_ai_provider.dart';
import '../services/ai/local_model_runtime.dart';
import '../services/ai/on_device_ai_provider.dart';
import '../services/ai/ai_response_orchestrator.dart';
import '../services/ai/ai_service.dart';
import '../services/ai/clinical/clinical_knowledge_repository.dart';
import '../services/ai/clinical/clinical_knowledge_retriever.dart';
import '../services/ai/ai_models.dart';
import 'data_providers.dart';
import 'local_model_provider.dart'; // REQUIRED for LocalModelRegistry

final clinicalKnowledgeRepositoryProvider = Provider<ClinicalKnowledgeRepository>((ref) {
  return LocalClinicalKnowledgeRepository();
});

final clinicalKnowledgeRetrieverProvider = Provider<ClinicalKnowledgeRetriever>((ref) {
  return ClinicalKnowledgeRetriever(ref.read(clinicalKnowledgeRepositoryProvider));
});

// SPRINT 8D: Implemented the Native Inference Bridge
final localModelRuntimeProvider = Provider<LocalModelRuntime>((ref) {
  return NativeModelRuntime(ref.read(localModelRegistryProvider));
});

final aiProviderImpl = Provider<AiProvider>((ref) {
  return OnDeviceAiProvider(
    runtime: ref.read(localModelRuntimeProvider),
    fallbackProvider: DevelopmentAiProvider(),
  );
});

final aiSafetyPolicyProvider = Provider<AiSafetyPolicy>((ref) => StandardSafetyPolicy());
final aiResponseValidatorProvider = Provider<AiResponseValidator>((ref) => StandardResponseValidator());

final aiOrchestratorProvider = Provider<AiResponseOrchestrator>((ref) {
  return AiResponseOrchestrator(
    ref.read(aiProviderImpl),
    ref.read(aiSafetyPolicyProvider),
    ref.read(aiResponseValidatorProvider),
    ref.read(clinicalKnowledgeRetrieverProvider),
  );
});

class ChatMessage {
  final String id;
  final String text;
  final bool isUser;
  final DateTime timestamp;
  final bool isEmergency;
  final bool isFallback;
  final List<ClinicalReferenceModel> sources;

  ChatMessage({
    required this.id, required this.text, required this.isUser,
    required this.timestamp, this.isEmergency = false, this.isFallback = false,
    this.sources = const [],
  });
}

class AiChatState {
  final List<ChatMessage> messages;
  final bool isLoading;
  AiChatState({this.messages = const [], this.isLoading = false});

  AiChatState copyWith({List<ChatMessage>? messages, bool? isLoading}) {
    return AiChatState(messages: messages ?? this.messages, isLoading: isLoading ?? this.isLoading);
  }
}

class AiChatNotifier extends AutoDisposeNotifier<AiChatState> {
  @override
  AiChatState build() {
    return AiChatState(
      messages: [
        ChatMessage(
          id: 'init_msg',
          text: 'Hello 👋 I am NurtureAI, your personal healthcare companion. How can I help you today?',
          isUser: false,
          timestamp: DateTime.now(),
        ),
      ],
    );
  }

  Future<void> sendMessage(String text) async {
    if (text.trim().isEmpty) return;

    final userMsg = ChatMessage(id: 'usr_${DateTime.now().millisecondsSinceEpoch}', text: text, isUser: true, timestamp: DateTime.now());
    state = state.copyWith(messages: [...state.messages, userMsg], isLoading: true);

    try {
      final dashboardData = await ref.read(homeDashboardProvider.future);
      final orchestrator = ref.read(aiOrchestratorProvider);

      final response = await orchestrator.process(currentData: dashboardData, question: text);

      final aiMsg = ChatMessage(
        id: 'ai_${DateTime.now().millisecondsSinceEpoch}', 
        text: response.text, 
        isUser: false,
        timestamp: response.generatedAt, 
        isEmergency: response.category == AiRoleClassification.emergencyOrDangerSign,
        isFallback: response.safetyLevel == AiSafetyLevel.unsupported,
        sources: response.sources,
      );

      state = state.copyWith(messages: [...state.messages, aiMsg], isLoading: false);
    } catch (e) {
      final errorMsg = ChatMessage(
        id: 'err_${DateTime.now().millisecondsSinceEpoch}',
        text: 'NurtureAI\'s assistant is currently unavailable. Your saved care information remains available offline.',
        isUser: false, timestamp: DateTime.now(), isFallback: true,
      );
      state = state.copyWith(messages: [...state.messages, errorMsg], isLoading: false);
    }
  }

  void clearConversation() {
    ref.invalidateSelf();
  }
  
  // SPRINT 8D: Explicit Cancellation support
  void cancelGeneration() {
    ref.read(localModelRuntimeProvider).cancel();
    state = state.copyWith(isLoading: false);
  }
}

final aiChatProvider = NotifierProvider.autoDispose<AiChatNotifier, AiChatState>(AiChatNotifier.new);