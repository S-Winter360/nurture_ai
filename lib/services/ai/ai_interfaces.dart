import 'ai_models.dart';

abstract class AiProvider {
  Future<AiResponse> generateResponse(AiContext context);
}

abstract class AiSafetyPolicy {
  AiRoleClassification classifyRequest(String userQuestion);
  bool isEmergencyOrDangerSign(String text);
}

abstract class AiResponseValidator {
  bool isValidAndSafe(AiResponse response, AiContext context);
  AiResponse sanitizeResponse(AiResponse response);
}