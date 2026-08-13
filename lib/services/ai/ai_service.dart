import 'ai_interfaces.dart';
import 'ai_models.dart';
import 'clinical/clinical_knowledge_result.dart';

// SPRINT 7G: Hardened Response Validator
class StandardResponseValidator implements AiResponseValidator {
  @override
  bool isValidAndSafe(AiResponse response, AiContext context) {
    final lower = response.text.toLowerCase();
    
    // 1. Block diagnostic and prescribing language
    if (lower.contains('diagnose') || lower.contains('prescribe')) return false;
    if (lower.contains('start this medication') || lower.contains('stop this medication')) return false;
    if (lower.contains('you have ') && (lower.contains('disease') || lower.contains('infection') || lower.contains('malaria'))) return false;
    
    // 2. Pattern match explicit unsafe dosage instructions (e.g. "take 500 mg", "take 2 tablets")
    final dosageRegex = RegExp(r'take\s+\d+\s*(mg|tablets|ml|drops)');
    if (dosageRegex.hasMatch(lower)) return false;

    // 3. Block fabricated citations if evidence is unavailable
    if (context.evidenceAssessment == ClinicalEvidenceAssessment.unavailable) {
      if (lower.contains('who recommends') || lower.contains('ghs recommends') || lower.contains('ghana health service') || lower.contains('world health organization')) {
        return false;
      }
    }

    return true;
  }

  @override
  AiResponse sanitizeResponse(AiResponse response) {
    return AiResponse.fallback('Verified local clinical reference information is currently unavailable for this question. I cannot safely diagnose or prescribe treatment.');
  }
}

// SPRINT 7G: Expanded Danger Sign Policy
class StandardSafetyPolicy implements AiSafetyPolicy {
  @override
  AiRoleClassification classifyRequest(String text) {
    if (isEmergencyOrDangerSign(text)) return AiRoleClassification.emergencyOrDangerSign;
    return AiRoleClassification.generalEducation;
  }

  @override
  bool isEmergencyOrDangerSign(String text) {
    final lower = text.toLowerCase();
    final dangerKeywords = [
      'bleeding', 'convulsion', 'seizure', 'fever', 'unconscious', 'breathing',
      'chest pain', 'loss of consciousness', 'not breathing'
    ];
    return dangerKeywords.any((k) => lower.contains(k));
  }
}