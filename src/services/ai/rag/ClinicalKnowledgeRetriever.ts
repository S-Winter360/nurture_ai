import { ClinicalKnowledgeIndex } from './ClinicalKnowledgeIndex';
import { ClinicalSourceRegistry } from './ClinicalSourceRegistry';
import { ClinicalEvidenceAssessment, ClinicalSourceItem } from './types';
import { SanitizedAiContext } from '../types';

export class ClinicalKnowledgeRetriever {
  /**
   * Evaluates user query and clinical context against verified GHS clinical knowledge assets.
   * Returns a structured ClinicalEvidenceAssessment.
   */
  public static retrieve(
    query: string,
    context?: SanitizedAiContext
  ): ClinicalEvidenceAssessment {
    if (!query || !query.trim()) {
      return {
        status: 'insufficient',
        evidenceText: '',
        matchedSources: [],
        primaryCitation: 'Ghana Health Service Protocols',
        confidence: 0,
        hasVerifiedGhsSource: false,
        explanation: 'Query was empty or lacked clinical search terms.'
      };
    }

    const trimmedQuery = query.trim();
    const profileType = context?.profileType === 'mother' ? 'mother' : context?.profileType === 'child' ? 'child' : undefined;

    // Search index
    const matchingChunks = ClinicalKnowledgeIndex.search(trimmedQuery, profileType);

    if (matchingChunks.length === 0) {
      return {
        status: 'unavailable',
        evidenceText: '',
        matchedSources: [],
        primaryCitation: 'Ghana Health Service Protocols',
        confidence: 0,
        hasVerifiedGhsSource: false,
        explanation: 'No verified GHS reference documents match this specific query. Verified local reference data is unavailable.'
      };
    }

    // Resolve sources
    const matchedSourcesMap = new Map<string, ClinicalSourceItem>();
    matchingChunks.forEach(chunk => {
      const src = ClinicalSourceRegistry.getSource(chunk.sourceId);
      if (src) {
        matchedSourcesMap.set(src.id, src);
      }
    });

    const matchedSources = Array.from(matchedSourcesMap.values());
    const primarySource = matchedSources[0] || ClinicalSourceRegistry.getAllSources()[0];

    // Combine evidence text
    const evidenceText = matchingChunks
      .map(c => `[${c.category}] ${c.detailedGuidance}`)
      .join('\n\n');

    const confidence = Math.min(0.98, 0.7 + (matchingChunks.length * 0.1));

    return {
      status: 'sufficient',
      evidenceText,
      matchedSources,
      primaryCitation: primarySource.standardCitation,
      confidence,
      hasVerifiedGhsSource: true,
      explanation: `Verified against ${matchedSources.length} official Ghana Health Service protocol(s).`
    };
  }
}
