import 'dart:convert';
import 'package:flutter/services.dart';
import 'clinical_document_asset.dart';
import 'clinical_knowledge_index.dart';

class LocalClinicalDocumentLoader {
  final AssetBundle assetBundle;

  LocalClinicalDocumentLoader({AssetBundle? bundle})
      : assetBundle = bundle ?? rootBundle;

  /// Safely loads registered asset files from local package bundle
  Future<List<ClinicalKnowledgeChunk>> loadAndIndexAssets(
    List<ClinicalDocumentAsset> assets,
  ) async {
    final List<ClinicalKnowledgeChunk> chunks = [];

    for (final asset in assets) {
      if (asset.verificationStatus == VerificationStatus.unavailable) {
        continue; // Omit unavailable assets safely
      }

      try {
        final jsonString = await assetBundle.loadString(asset.assetPath);
        final List<dynamic> rawList = json.decode(jsonString);

        for (final item in rawList) {
          if (item is Map<String, dynamic>) {
            chunks.add(ClinicalKnowledgeChunk.fromMap(item, asset));
          }
        }
      } catch (e) {
        // Safe non-crashing degradation when asset file is absent/unparseable
      }
    }

    return chunks;
  }
}