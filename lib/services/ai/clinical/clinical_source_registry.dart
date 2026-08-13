import 'clinical_knowledge_result.dart';

class ClinicalSourceRegistry {
  static final Map<String, Map<String, String>> _approvedSources = {
    'doc_ghs_sm_2019': {
      'sourceOrg': 'Ghana Health Service / Ministry of Health',
      'documentTitle': 'National Safe Motherhood Clinical Guidelines',
      'publicationYear': '2019',
      'version': '1.0',
    },
    'doc_ghs_epi_2023': {
      'sourceOrg': 'Ghana Health Service - EPI',
      'documentTitle': 'Comprehensive Multi-Year Plan / Ghana EPI Schedule',
      'publicationYear': '2023',
      'version': '2023.1',
    },
    'doc_who_pnc_2022': {
      'sourceOrg': 'World Health Organization (WHO)',
      'documentTitle': 'WHO recommendations on maternal and newborn care for a positive postnatal experience',
      'publicationYear': '2022',
      'version': '1.0',
    }
  };

  /// Verifies if a given document ID and metadata perfectly match the approved registry.
  /// Prevents fabricated or unverified sources from entering the RAG context.
  static ClinicalKnowledgeTrustStatus verifySource(String id, String org, String title) {
    if (!_approvedSources.containsKey(id)) {
      return ClinicalKnowledgeTrustStatus.unverified;
    }
    
    final approved = _approvedSources[id]!;
    if (approved['sourceOrg'] == org && approved['documentTitle'] == title) {
      return ClinicalKnowledgeTrustStatus.verified;
    }
    
    return ClinicalKnowledgeTrustStatus.unverified;
  }
}