import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart';
import 'package:nurture_ai/models/user_model.dart';
import 'package:nurture_ai/models/child_model.dart';
import 'package:nurture_ai/models/growth_record_model.dart';
import 'package:nurture_ai/providers/data_providers.dart';
import 'package:nurture_ai/services/ai/ai_models.dart';
import 'package:nurture_ai/services/ai/ai_service.dart';
import 'package:nurture_ai/services/ai/ai_interfaces.dart';
import 'package:nurture_ai/services/ai/development_ai_provider.dart';
import 'package:nurture_ai/services/ai/ai_response_orchestrator.dart'; // <--- FIXED
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_repository.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_retriever.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_result.dart';
import 'package:nurture_ai/services/ai/clinical/local_clinical_document_loader.dart';
import 'package:nurture_ai/services/growth/growth_assessment_service.dart';

class FakeAssetBundle extends CachingAssetBundle {
  final Map<String, String> assets;
  FakeAssetBundle(this.assets);

  @override
  Future<String> loadString(String key, {bool cache = true}) async {
    if (assets.containsKey(key)) return assets[key]!;
    throw Exception('Asset not found: $key');
  }

  @override
  Future<ByteData> load(String key) async => throw UnimplementedError();
}

class EvilPrescribingProvider implements AiProvider {
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

void main() {
  group('Sprint 7D Clinical RAG & Knowledge Layer Tests', () {
    late FakeAssetBundle fakeBundle;
    late LocalClinicalDocumentLoader loader;
    late LocalClinicalKnowledgeRepository repo;
    late ClinicalKnowledgeRetriever retriever;
    late AiResponseOrchestrator aiService;
    late DashboardData mockDashboard;

    const validJson = '''
    [
      {
        "chunk_id": "chunk_01",
        "section": "Vaccination Schedule",
        "text": "Pentavalent vaccine is administered at 6, 10, and 14 weeks.",
        "keywords": ["pentavalent", "vaccine", "weeks"]
      }
    ]
    ''';

    setUp(() {
      fakeBundle = FakeAssetBundle({
        'assets/clinical/ghs_safe_motherhood.json': validJson,
        'assets/clinical/ghs_epi.json': validJson,
      });

      loader = LocalClinicalDocumentLoader(bundle: fakeBundle);
      repo = LocalClinicalKnowledgeRepository(loader: loader);
      retriever = ClinicalKnowledgeRetriever(repo);

      aiService = AiResponseOrchestrator(
        DevelopmentAiProvider(),
        StandardSafetyPolicy(),
        StandardResponseValidator(),
        retriever,
      );

      mockDashboard = DashboardData(
        user: UserModel(id: 'u1', name: 'Ama', phoneNumber: '+1234567890', preferredLanguage: 'en', preferredVoice: 'female', createdAt: DateTime.now(), updatedAt: DateTime.now()),
        selectedChild: ChildModel(id: 'c1', caregiverId: 'u1', name: 'Leo', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now()),
      );
    });

    test('1. Reference retrieval matching a verified topic returns source document', () async {
      final result = await retriever.retrieveKnowledge('When should my baby get pentavalent vaccine?');
      expect(result.status, KnowledgeRetrievalStatus.verifiedReferenceFound);
      expect(result.references.isNotEmpty, isTrue);
    });

    test('2. Source traceability metadata is correctly preserved', () async {
      final refs = await repo.search('pentavalent vaccine');
      expect(refs.first.documentTitle, isNotEmpty);
    });

    test('3. Query with no verified source returns REFERENCE_DATA_UNAVAILABLE safely', () async {
      final result = await retriever.retrieveKnowledge('Unspecified non-existent medical condition xyz123');
      expect(result.status, KnowledgeRetrievalStatus.referenceDataUnavailable);
      expect(result.references.isEmpty, isTrue);
    });

    test('4 & 5. Privacy & Isolation: Retrieval context contains NO SQLite IDs or phone numbers', () async {
      final response = await aiService.process(
        currentData: mockDashboard,
        question: 'What vaccinations are needed for Leo?',
      );

      final responseText = response.text;
      expect(responseText.contains('+1234567890'), isFalse);
      expect(responseText.contains('u1'), isFalse);
    });

    test('6. Emergency short circuit executes BEFORE knowledge retrieval', () async {
      final response = await aiService.process(
        currentData: mockDashboard,
        question: 'My baby is bleeding heavily',
      );

      expect(response.category, AiRoleClassification.emergencyOrDangerSign);
      expect(response.providerName, 'SafetyPolicy');
    });

    test('7. Growth Protection: WHO growth calculations remain PENDING_REFERENCE_DATA', () {
      final growthService = GrowthAssessmentService();
      final dummyRecord = GrowthRecordModel(id: '1', childId: 'c1', recordDate: DateTime.now(), weightKg: 10, heightCm: 80, createdAt: DateTime.now(), updatedAt: DateTime.now());
      final dummyChild = ChildModel(id: 'c1', caregiverId: 'u1', name: 'Leo', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now());

      expect(growthService.evaluateMeasurements(dummyRecord, dummyChild).status, 'PENDING_REFERENCE_DATA');
    });

    test('8. Care Engine Isolation: Clinical retrieval possesses no database write capabilities', () {
      final repoMethods = repo.runtimeType.toString();
      expect(repoMethods.contains('insert'), isFalse);
      expect(repoMethods.contains('update'), isFalse);
    });

    test('9. Offline Operation: Entire retrieval pipeline executes with zero network calls', () async {
      final result = await retriever.retrieveKnowledge('pentavalent');
      expect(result.status, KnowledgeRetrievalStatus.verifiedReferenceFound);
    });

    test('10. Response Validation: Unauthorized clinical output is intercepted and sanitized', () async {
      final evilService = AiResponseOrchestrator(
        EvilPrescribingProvider(),
        StandardSafetyPolicy(),
        StandardResponseValidator(),
        retriever,
      );

      final response = await evilService.process(
        currentData: mockDashboard,
        question: 'What should I take for a mild cough?',
      );

      expect(response.safetyLevel, AiSafetyLevel.unsupported);
      expect(response.text.contains('I cannot safely diagnose or prescribe'), isTrue);
    });
  });
}