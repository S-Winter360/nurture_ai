import '../../../models/clinical_reference_model.dart';
import 'clinical_document_asset.dart';

class ClinicalKnowledgeChunk {
  final String chunkId;
  final String documentId;
  final String sourceOrg;
  final String documentTitle;
  final String publicationYear;
  final String version;
  final String section;
  final String text;
  final List<String> keywords;

  ClinicalKnowledgeChunk({
    required this.chunkId, required this.documentId, required this.sourceOrg,
    required this.documentTitle, required this.publicationYear, required this.version,
    required this.section, required this.text, required this.keywords,
  });

  factory ClinicalKnowledgeChunk.fromMap(Map<String, dynamic> map, ClinicalDocumentAsset asset) {
    return ClinicalKnowledgeChunk(
      chunkId: map['chunk_id'] as String? ?? 'chunk_${DateTime.now().millisecondsSinceEpoch}',
      documentId: asset.id, sourceOrg: asset.sourceOrg, documentTitle: asset.documentTitle,
      publicationYear: asset.publicationYear, version: asset.version,
      section: map['section'] as String? ?? 'General Section',
      text: map['text'] as String? ?? '',
      keywords: (map['keywords'] as List<dynamic>?)?.map((e) => e.toString().toLowerCase()).toList() ?? [],
    );
  }

  ClinicalReferenceModel toReferenceModel() {
    return ClinicalReferenceModel(
      id: chunkId, sourceOrg: sourceOrg, documentTitle: documentTitle,
      publicationYear: publicationYear, section: section, topic: keywords.join(' '),
      version: version, content: text, reviewed: true,
    );
  }
}

// FIXED: Renamed _ScoredChunk to public ScoredChunk so repository can use it
class ScoredChunk {
  final ClinicalKnowledgeChunk chunk;
  final int score;
  ScoredChunk(this.chunk, this.score);
}

class ClinicalKnowledgeIndex {
  final List<ClinicalKnowledgeChunk> _chunks = [];

  void registerChunk(ClinicalKnowledgeChunk chunk) {
    _chunks.add(chunk);
  }

  void clear() => _chunks.clear();
  bool get isEmpty => _chunks.isEmpty;

  List<ScoredChunk> search(String query) {
    final lowerQuery = query.toLowerCase().trim();
    if (lowerQuery.isEmpty) return [];

    final queryWords = lowerQuery.split(' ').where((w) => w.length > 2).toList();
    final List<ScoredChunk> scoredList = [];

    for (final chunk in _chunks) {
      int score = 0;
      final chunkTextLower = chunk.text.toLowerCase();
      final sectionLower = chunk.section.toLowerCase();
      final titleLower = chunk.documentTitle.toLowerCase();

      if (chunkTextLower.contains(lowerQuery)) score += 100;
      if (titleLower.contains(lowerQuery)) score += 40;
      if (sectionLower.contains(lowerQuery)) score += 30;
      for (final word in queryWords) {
        if (chunk.keywords.contains(word)) score += 10;
      }

      if (score > 0) scoredList.add(ScoredChunk(chunk, score));
    }

    scoredList.sort((a, b) {
      final scoreCompare = b.score.compareTo(a.score);
      if (scoreCompare != 0) return scoreCompare;
      return a.chunk.chunkId.compareTo(b.chunk.chunkId);
    });

    return scoredList.take(5).toList();
  }
}