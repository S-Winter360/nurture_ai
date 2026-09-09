import { SanitizedAiContext } from '../../aiContext';
import { ClinicalEvidenceAssessment } from '../rag/types';
import { AiTraceabilityOrigin } from '../types';

export const GATEWAY_MAX_MESSAGE_LENGTH = 4000;
export const GATEWAY_MAX_PAYLOAD_BYTES = 65536; // 64 KB
export const GATEWAY_DEFAULT_TIMEOUT_MS = 10000;
export const GATEWAY_MIN_TIMEOUT_MS = 2000;

/**
 * Strongly-typed request payload sent from NurtureAI client to the secure AI Gateway.
 * Stripped of all raw database primary keys, Firebase UIDs, and PII.
 */
export interface AiGatewayRequest {
  message: string;
  language: string;
  context: SanitizedAiContext;
  evidence?: ClinicalEvidenceAssessment | any[] | string;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Strongly-typed response payload returned by the secure AI Gateway.
 */
export interface AiGatewayResponse {
  text: string;
  provider: 'cloud';
  model: string;
  evidenceAssessment?: any;
  requestId: string;
  origin?: AiTraceabilityOrigin;
  citation?: string;
  confidence?: number;
  sourceReferences?: string[];
}

/**
 * Structured gateway error representation.
 */
export interface AiGatewayError {
  code: string;
  message: string;
  status?: number;
  recoverable: boolean;
  retryAfterMs?: number;
}
