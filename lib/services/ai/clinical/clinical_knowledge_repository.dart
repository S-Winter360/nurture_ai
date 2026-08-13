import '../../../models/clinical_reference_model.dart';
import 'clinical_document_asset.dart';
import 'clinical_knowledge_index.dart';
import 'local_clinical_document_loader.dart';

abstract class ClinicalKnowledgeRepository {
  Future<List<ClinicalReferenceModel>> search(String query);
  Future<List<ScoredChunk>> searchScored(String query); // FIXED: Added Scored method
  Future<ClinicalReferenceModel?> getById(String id);
  Future<void> ensureIndexed();
}

class LocalClinicalKnowledgeRepository implements ClinicalKnowledgeRepository {
  final LocalClinicalDocumentLoader _loader;
  final ClinicalKnowledgeIndex _index = ClinicalKnowledgeIndex();
  bool _isIndexed = false;

  final List<ClinicalReferenceModel> _registry = [
    ClinicalReferenceModel(id: 'ref_ghs_sm_2019', sourceOrg: 'Ghana Health Service / Ministry of Health', documentTitle: 'National Safe Motherhood Clinical Guidelines', publicationYear: '2019', section: 'Antenatal & Postnatal Care Protocols', topic: 'anc pnc iron pregnancy bleeding maternal', version: '1.0', content: 'REFERENCE_DATA_AVAILABLE: Standard GHS 8-contact ANC model and 4-visit PNC protocol.', reviewed: true),
    ClinicalReferenceModel(id: 'ref_ghs_epi_2023', sourceOrg: 'Ghana Health Service - EPI', documentTitle: 'Comprehensive Multi-Year Plan / Ghana EPI Schedule', publicationYear: '2023', section: 'Childhood Immunization Protocols', topic: 'vaccine penta pentavalent bcg opv pcv rota measles polio yellow fever mena', version: '2023.1', content: 'REFERENCE_DATA_AVAILABLE: Official Ghana national vaccination schedule.', reviewed: true),
    ClinicalReferenceModel(id: 'ref_who_pnc_2022', sourceOrg: 'World Health Organization (WHO)', documentTitle: 'WHO recommendations on maternal and newborn care for a positive postnatal experience', publicationYear: '2022', section: 'Newborn Care & Breastfeeding', topic: 'newborn postnatal cord care breastfeeding temperature', version: '1.0', content: 'REFERENCE_DATA_AVAILABLE: Immediate newborn thermal care, chlorhexidine cord care, and EBF.', reviewed: true),
    ClinicalReferenceModel(id: 'ref_ghs_child_health', sourceOrg: 'Ghana Health Service', documentTitle: 'GHS Child Health Policy & Preventive Care', publicationYear: '2020', section: 'Under-5 Preventive Interventions', topic: 'nutrition vitamin a deworming under-5 feeding', version: '1.0', content: 'REFERENCE_DATA_AVAILABLE: Bi-annual Vitamin A and routine deworming guidelines.', reviewed: true),
  ];

  final List<ClinicalDocumentAsset> _registeredAssets = [
    ClinicalDocumentAsset(id: 'doc_ghs_sm_2019', sourceOrg: 'Ghana Health Service / Ministry of Health', documentTitle: 'National Safe Motherhood Clinical Guidelines', publicationYear: '2019', version: '1.0', category: 'maternal', assetPath: 'assets/clinical/ghs_safe_motherhood.json'),
    ClinicalDocumentAsset(id: 'doc_ghs_epi_2023', sourceOrg: 'Ghana Health Service - EPI', documentTitle: 'Comprehensive Multi-Year Plan / Ghana EPI Schedule', publicationYear: '2023', version: '2023.1', category: 'vaccination', assetPath: 'assets/clinical/ghs_epi.json'),
  ];

  LocalClinicalKnowledgeRepository({LocalClinicalDocumentLoader? loader}) : _loader = loader ?? LocalClinicalDocumentLoader();

  @override
  Future<void> ensureIndexed() async {
    if (_isIndexed) return;
    final chunks = await _loader.loadAndIndexAssets(_registeredAssets);
    _index.clear();
    for (final chunk in chunks) { _index.registerChunk(chunk); }
    _isIndexed = true;
  }

  @override
  Future<List<ClinicalReferenceModel>> search(String query) async {
    await ensureIndexed();
    if (_index.isEmpty) return _searchRegistry(query);
    final matchedChunks = _index.search(query);
    if (matchedChunks.isEmpty) return [];
    return matchedChunks.map((sc) => sc.chunk.toReferenceModel()).toList(); // FIXED: .chunk extraction
  }

  @override
  Future<List<ScoredChunk>> searchScored(String query) async {
    await ensureIndexed();
    if (_index.isEmpty) {
      // Return un-scored registry fallbacks mapped to ScoredChunk for test compatibility
      final registryMatches = _searchRegistry(query);
      return registryMatches.map((r) => ScoredChunk(
        ClinicalKnowledgeChunk(chunkId: r.id, documentId: r.id, sourceOrg: r.sourceOrg, documentTitle: r.documentTitle, publicationYear: r.publicationYear, version: r.version, section: r.section ?? '', text: r.content, keywords: []),
        50,
      )).toList();
    }
    return _index.search(query); // Returns List<ScoredChunk> directly
  }

  List<ClinicalReferenceModel> _searchRegistry(String query) {
    final lowerQuery = query.toLowerCase().trim();
    if (lowerQuery.isEmpty) return [];
    final matches = <ClinicalReferenceModel>[];
    final words = lowerQuery.split(' ');
    for (final ref in _registry) {
      final topicWords = ref.topic.toLowerCase().split(' ');
      if (words.any((w) => w.length > 2 && topicWords.contains(w))) matches.add(ref);
    }
    return matches;
  }

  @override
  Future<ClinicalReferenceModel?> getById(String id) async {
    await ensureIndexed();
    if (!_index.isEmpty) {
      final results = _index.search(id);
      if (results.isNotEmpty) return results.first.chunk.toReferenceModel(); // FIXED: .chunk extraction
    }
    try { return _registry.firstWhere((r) => r.id == id); } catch (_) { return null; }
  }
}