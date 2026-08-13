import 'ai_interfaces.dart';
import 'ai_models.dart';
import 'local_model_runtime.dart';
import 'development_ai_provider.dart';
import 'local_model_registry.dart'; // Added

class OnDeviceAiProvider implements AiProvider {
  final LocalModelRuntime _runtime;
  final AiProvider _fallbackProvider;

  OnDeviceAiProvider({
    LocalModelRuntime? runtime,
    AiProvider? fallbackProvider,
  })  : _runtime = runtime ?? StubLocalModelRuntime(LocalModelRegistry()), // <--- FIXED
        _fallbackProvider = fallbackProvider ?? DevelopmentAiProvider();

  @override
  Future<AiResponse> generateResponse(AiContext context) async {
    try {
      final isAvailable = await _runtime.isModelAvailable();
      if (!isAvailable) {
        return await _fallbackProvider.generateResponse(context);
      }

      final isInitialized = await _runtime.initializeModel();
      if (!isInitialized) {
        return await _fallbackProvider.generateResponse(context);
      }

      final prompt = _buildPrompt(context);

      final rawOutput = await _runtime.runInference(prompt);
      if (rawOutput == null || rawOutput.trim().isEmpty) {
        return await _fallbackProvider.generateResponse(context);
      }

      return AiResponse(
        text: rawOutput.trim(),
        category: context.safetyClassification,
        safetyLevel: AiSafetyLevel.verifiedReference,
        evidenceAssessment: context.evidenceAssessment, 
        requiresProfessionalCare: false,
        disclaimerRequired: true, 
        generatedAt: DateTime.now(),
        providerName: 'OnDeviceAiProvider (LiteRT/Gemma)',
      );
    } catch (e) {
      return await _fallbackProvider.generateResponse(context);
    }
  }

  String _buildPrompt(AiContext context) {
    return 'Profile: ${context.selectedProfileName} (${context.profileType}). Question: ${context.userQuestion}';
  }
}