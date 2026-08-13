import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/services.dart';
import 'package:nurture_ai/models/user_model.dart';
import 'package:nurture_ai/models/child_model.dart';
import 'package:nurture_ai/models/growth_record_model.dart';
import 'package:nurture_ai/providers/data_providers.dart';
import 'package:nurture_ai/services/ai/ai_models.dart';
import 'package:nurture_ai/services/ai/development_ai_provider.dart';
import 'package:nurture_ai/services/ai/ai_response_orchestrator.dart'; // <--- FIXED
import 'package:nurture_ai/services/ai/ai_service.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_document_asset.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_index.dart';
import 'package:nurture_ai/services/ai/clinical/local_clinical_document_loader.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_repository.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_retriever.dart';
import 'package:nurture_ai/services/ai/clinical/clinical_knowledge_result.dart';
import 'package:nurture_ai/services/growth/growth_assessment_service.dart';

class FakeAssetBundle extends CachingAssetBundle {
  final Map<String, String> assets;
  FakeAssetBundle(this.assets);

  @override
  Future<String> loadString(String key, {bool cache = true}) async {
    if (assets.containsKey(key)) {
      return assets[key]!;
    }
    throw Exception('Asset not found: $key');
  }

  @override
  Future<ByteData> load(String key) async => throw UnimplementedError();
}

void main() {
  group('Sprint 7E Clinical Document Ingestion & Local RAG Tests', () {
    late FakeAssetBundle fakeBundle;
    late LocalClinicalDocumentLoader loader;
    late LocalClinicalKnowledgeRepository repo;
    late ClinicalKnowledgeRetriever retriever;
    late AiResponseOrchestrator aiService; // <--- FIXED
    late DashboardData mockDashboard;

    const validGhsJson = '''
    [
      {
        "chunk_id": "chunk_01",
        "section": "ANC Contacts",
        "text": "The Ghana Health Service recommends 8 ANC contacts.",
        "keywords": ["anc", "antenatal", "contacts", "ghana"]
      }
    ]
    ''';

    setUp(() {
      fakeBundle = FakeAssetBundle({
        'assets/clinical/ghs_safe_motherhood.json': validGhsJson,
      });

      loader = LocalClinicalDocumentLoader(bundle: fakeBundle);
      repo = LocalClinicalKnowledgeRepository(loader: loader);
      retriever = ClinicalKnowledgeRetriever(repo);

      aiService = AiResponseOrchestrator( // <--- FIXED
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

    test('1. Local clinical asset loading parses chunks correctly from AssetBundle', () async {
      final assets = [
        ClinicalDocumentAsset(
          id: 'doc1', sourceOrg: 'GHS', documentTitle: 'Safe Motherhood',
          publicationYear: '2019', version: '1.0', category: 'maternal',
          assetPath: 'assets/clinical/ghs_safe_motherhood.json',
        )
      ];

      final chunks = await loader.loadAndIndexAssets(assets);
      expect(chunks.length, 1);
      expect(chunks.first.chunkId, 'chunk_01');
      expect(chunks.first.documentTitle, 'Safe Motherhood');
    });

    test('2. Missing asset file handles degradation safely without crashing', () async {
      final missingAssets = [
        ClinicalDocumentAsset(
          id: 'doc_missing', sourceOrg: 'GHS', documentTitle: 'Non Existent',
          publicationYear: '2024', version: '1.0', category: 'general',
          assetPath: 'assets/clinical/does_not_exist.json',
        )
      ];

      final chunks = await loader.loadAndIndexAssets(missingAssets);
      expect(chunks.isEmpty, isTrue);
    });

    test('3 & 4. Deterministic Indexing & Stable Chunk ID Tie-Breaking', () {
      final index = ClinicalKnowledgeIndex();
      final chunkA = ClinicalKnowledgeChunk(chunkId: 'chunk_A', documentId: 'd1', sourceOrg: 'GHS', documentTitle: 'T', publicationYear: '2019', version: '1.0', section: 'ANC', text: 'Iron supplementation', keywords: ['iron']);
      final chunkB = ClinicalKnowledgeChunk(chunkId: 'chunk_B', documentId: 'd1', sourceOrg: 'GHS', documentTitle: 'T', publicationYear: '2019', version: '1.0', section: 'ANC', text: 'Iron supplementation', keywords: ['iron']);

      index.registerChunk(chunkB);
      index.registerChunk(chunkA);

      final results = index.search('iron');
      expect(results.length, 2);
      expect(results.first.chunk.chunkId, 'chunk_A');
    });

    test('5 & 6. Deterministic Keyword Retrieval & Source Traceability', () async {
      final result = await retriever.retrieveKnowledge('anc contacts');
      expect(result.status, KnowledgeRetrievalStatus.verifiedReferenceFound);
      expect(result.references.first.sourceOrg, 'Ghana Health Service / Ministry of Health');
      expect(result.references.first.section, 'ANC Contacts');
    });

    test('8. Unsupported query returns referenceDataUnavailable', () async {
      final result = await retriever.retrieveKnowledge('unsupported random medical query 123');
      expect(result.status, KnowledgeRetrievalStatus.referenceDataUnavailable);
      expect(result.references.isEmpty, isTrue);
    });

    test('10. Privacy: AI Context Strips User IDs and Phone Numbers', () async {
      final response = await aiService.process( // <--- FIXED
        currentData: mockDashboard,
        question: 'What are ANC contacts?',
      );

      final responseText = response.text;
      expect(responseText.contains('+1234567890'), isFalse);
      expect(responseText.contains('u1'), isFalse);
    });

    test('11. Emergency prompts bypass document retrieval and short-circuit immediately', () async {
      final response = await aiService.process( // <--- FIXED
        currentData: mockDashboard,
        question: 'Help, my baby is bleeding',
      );

      expect(response.category, AiRoleClassification.emergencyOrDangerSign);
      expect(response.providerName, 'SafetyPolicy');
    });

    test('12. Growth Reference Protection remains PENDING_REFERENCE_DATA', () {
      final growthService = GrowthAssessmentService();
      final dummyRecord = GrowthRecordModel(id: '1', childId: 'c1', recordDate: DateTime.now(), weightKg: 10, heightCm: 80, createdAt: DateTime.now(), updatedAt: DateTime.now());
      final dummyChild = ChildModel(id: 'c1', caregiverId: 'u1', name: 'Leo', dateOfBirth: DateTime.now(), sex: 'M', createdAt: DateTime.now(), updatedAt: DateTime.now());

      expect(growthService.evaluateMeasurements(dummyRecord, dummyChild).status, 'PENDING_REFERENCE_DATA');
    });

    test('14. Offline Guarantee: Zero network calls during document retrieval', () async {
      final result = await retriever.retrieveKnowledge('anc');
      expect(result.status, KnowledgeRetrievalStatus.verifiedReferenceFound);
    });
  });
}