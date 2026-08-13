import 'ai_interfaces.dart';
import 'ai_models.dart';

class DevelopmentAiProvider implements AiProvider {
  @override
  Future<AiResponse> generateResponse(AiContext context) async {
    return AiResponse(
      text: 'This is a local architectural stub. You asked: "${context.userQuestion}". I see your profile is ${context.selectedProfileName}.',
      category: AiRoleClassification.appAssistance,
      safetyLevel: AiSafetyLevel.limited,
      evidenceAssessment: context.evidenceAssessment, // FIXED: Passed through
      requiresProfessionalCare: false,
      disclaimerRequired: true, // FIXED: Added
      generatedAt: DateTime.now(),
      providerName: 'DevelopmentAiProvider',
    );
  }
}