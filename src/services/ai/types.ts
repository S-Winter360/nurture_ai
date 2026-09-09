import { FamilyMember, SupportedLanguage } from '../../types';
import type { SanitizedAiContext } from '../aiContext';
import { ClinicalEvidenceAssessment } from './rag/types';

export type { SanitizedAiContext };

export type AiSafetyClassification =
  | 'SAFE_GENERAL'
  | 'CLINICAL_INFORMATION'
  | 'MEDICATION_INFORMATION'
  | 'PREGNANCY'
  | 'NEWBORN'
  | 'CHILD_HEALTH'
  | 'VACCINATION'
  | 'EMERGENCY'
  | 'UNSUPPORTED'
  | 'PROHIBITED_ACTION';

export type AiContextCategory =
  | 'CARE_TODAY'
  | 'NEXT_CARE'
  | 'OVERDUE_CARE'
  | 'UPCOMING_CARE'
  | 'VACCINATION'
  | 'PREGNANCY'
  | 'NEWBORN'
  | 'CHILD_HEALTH'
  | 'REMINDER'
  | 'GENERAL_HEALTH'
  | 'EMERGENCY'
  | 'UNSUPPORTED';

export interface StructuredCareSummary {
  memberId: string;
  memberName: string;
  profileType: 'mother' | 'child' | 'other';
  dueTodayCount: number;
  overdueCount: number;
  upcomingCount: number;
  completedCount: number;
  nextCareEventTitle?: string;
  nextCareEventDate?: string;
  nextCareEventType?: string;
  nextVaccineName?: string;
  nextVaccineDate?: string;
  overdueEventTitles: string[];
  deterministicSummaryText: string;
  hasCareToday: boolean;
  hasOverdueCare: boolean;
}

export type CareExplanationActionType = 'importance' | 'prepare' | 'questions' | 'missed';

export type AiProviderType = 'LOCAL_MODEL' | 'REMOTE_MODEL' | 'FALLBACK';

export type AiTraceabilityOrigin =
  | 'LOCAL_CLINICAL_DATA'
  | 'GHS_CLINICAL_ASSET'
  | 'CARE_ENGINE'
  | 'USER_PROVIDED_CONTEXT'
  | 'AI_MODEL_GENERAL_KNOWLEDGE'
  | 'FALLBACK';

export type AiModelStatus =
  | 'NOT_AVAILABLE'
  | 'CHECKING'
  | 'DOWNLOADING'
  | 'VERIFYING'
  | 'AVAILABLE'
  | 'ACTIVE'
  | 'FAILED'
  | 'CANCELLED'
  | 'OUTDATED'
  | 'UNSUPPORTED_DEVICE'
  | 'INSUFFICIENT_STORAGE';

export type NetworkStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

export interface AiModelMetadata {
  id: string;
  name: string;
  version: string;
  sizeBytes: number;
  expectedChecksumSha256: string;
  downloadUrl: string;
  description: string;
  format: 'quantized-onnx' | 'gguf' | 'clinical-weights';
  runtime?: string;
  minAppVersion?: string;
  lastUpdated?: string;
}

export interface AiModelDownloadProgress {
  modelId: string;
  bytesReceived: number;
  totalBytes: number;
  percentage: number;
  status: AiModelStatus;
  error?: string;
  speedBytesPerSec?: number;
  estimatedRemainingSec?: number;
  isIndeterminate?: boolean;
}

export interface AiChatMessage {
  id: string;
  conversationId: string;
  familyMemberId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  safetyClassification?: AiSafetyClassification;
  isEmergencyAlert?: boolean;
  citation?: string;
  providerType?: AiProviderType;
  origin?: AiTraceabilityOrigin;
}

export interface AiAgentRequest {
  message: string;
  activeMember?: FamilyMember;
  conversationHistory?: AiChatMessage[];
  preferredLanguage?: SupportedLanguage;
  voiceMode?: boolean;
  clinicalContext?: SanitizedAiContext;
  signal?: AbortSignal;
}

export interface AiAgentResponse {
  id: string;
  text: string;
  safetyClassification: AiSafetyClassification;
  emergencyFlag: boolean;
  sourceMetadata: string;
  origin: AiTraceabilityOrigin;
  providerInfo: {
    name: string;
    type: AiProviderType;
    isLocal: boolean;
    isFallback: boolean;
  };
  timestamp: string;
  suggestedActions?: string[];
  isProhibitedAction?: boolean;
  prohibitedReason?: string;
}

export interface AiProviderRequest {
  query: string;
  sanitizedContext: SanitizedAiContext;
  safetyClassification: AiSafetyClassification;
  preferredLanguage: SupportedLanguage;
  conversationHistory?: { role: 'user' | 'assistant'; content: string }[];
  signal?: AbortSignal;
  clinicalEvidence?: ClinicalEvidenceAssessment;
}

export interface AiProviderResponse {
  text: string;
  origin: AiTraceabilityOrigin;
  citation: string;
  confidence?: number;
  provider?: { name: string; type: AiProviderType; isLocal: boolean; isFallback: boolean };
  model?: string;
  evidenceAssessment?: ClinicalEvidenceAssessment;
  sourceReferences?: string[];
  timestamp?: string;
}

export interface AiProvider {
  getInfo(): { name: string; type: AiProviderType; isLocal: boolean; isFallback: boolean };
  isAvailable(): Promise<boolean>;
  generate(request: AiProviderRequest): Promise<AiProviderResponse>;
}
