export type ClinicalEvidenceStatus = 'sufficient' | 'insufficient' | 'conflicting' | 'unavailable';

export interface ClinicalSourceItem {
  id: string;
  title: string;
  organization: 'GHS' | 'WHO' | 'UNICEF';
  year: number;
  edition?: string;
  description: string;
  isVerified: boolean;
  standardCitation: string;
}

export interface ClinicalKnowledgeChunk {
  id: string;
  sourceId: string;
  category: 'ANC' | 'EPI' | 'MALARIA_IPTP' | 'NUTRITION_IFA' | 'INFANT_FEEDING' | 'DANGER_SIGNS' | 'GENERAL_CARE';
  keywords: string[];
  summary: string;
  detailedGuidance: string;
  targetProfile: 'mother' | 'child' | 'both';
  gestationalWeekRange?: [number, number];
  childAgeWeeksRange?: [number, number];
  sourceCitation: string;
}

export interface ClinicalEvidenceAssessment {
  status: ClinicalEvidenceStatus;
  evidenceText: string;
  matchedSources: ClinicalSourceItem[];
  primaryCitation: string;
  confidence: number;
  hasVerifiedGhsSource: boolean;
  explanation?: string;
}
