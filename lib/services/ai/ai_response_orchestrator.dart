import 'ai_interfaces.dart';
import 'ai_models.dart';
import 'ai_context_builder.dart';
import 'clinical/clinical_knowledge_retriever.dart';
import 'clinical/clinical_knowledge_result.dart';
import '../../providers/data_providers.dart';

class AiResponseOrchestrator {
  final AiProvider _provider;
  final AiSafetyPolicy _safetyPolicy;
  final AiResponseValidator _validator;
  final ClinicalKnowledgeRetriever _retriever;

  AiResponseOrchestrator(
    this._provider,
    this._safetyPolicy,
    this._validator,
    this._retriever,
  );

  Future<AiResponse> process({
    required DashboardData currentData,
    required String question,
  }) async {
    try {
      // STEP 1 & 2: Safety Classification & Emergency Short-Circuit
      final classification = _safetyPolicy.classifyRequest(question);

      if (classification == AiRoleClassification.emergencyOrDangerSign) {
        return AiResponse(
          text: 'This sounds like it may require urgent medical attention. Please contact a health worker or proceed to the nearest health facility immediately.',
          category: AiRoleClassification.emergencyOrDangerSign,
          safetyLevel: AiSafetyLevel.verifiedReference,
          evidenceAssessment: ClinicalEvidenceAssessment.sufficient,
          requiresProfessionalCare: true,
          disclaimerRequired: true,
          generatedAt: DateTime.now(),
          providerName: 'SafetyPolicy',
        );
      }

      // STEP 3: Clinical Knowledge Retrieval (Bounded & Deterministic)
      final retrievalResult = await _retriever.retrieveKnowledge(question);

      // STEP 4: Privacy-Conscious Profile-Scoped Context Building
      final context = AiContextBuilder.buildContext(
        dashboardData: currentData,
        userQuestion: question,
        classification: classification,
        retrievalResult: retrievalResult,
      );

      // STEP 5: AI Generation (Strictly Read-Only)
      final rawResponse = await _provider.generateResponse(context);

      // STEP 6: Response Validation & Governance Enforcement
      if (!_validator.isValidAndSafe(rawResponse, context)) {
        return _validator.sanitizeResponse(rawResponse);
      }

      // STEP 7: Safe Orchestration Result
      return rawResponse;
    } catch (e) {
      return AiResponse.fallback('NurtureAI\'s assistant is currently unavailable. Your saved care information remains available offline.');
    }
  }
}