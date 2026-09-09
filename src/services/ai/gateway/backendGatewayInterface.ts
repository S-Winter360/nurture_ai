import { AiGatewayRequest, AiGatewayResponse, AiGatewayError } from './aiGatewayTypes';

export interface BackendAiGatewayConfig {
  geminiApiKey?: string | null;
  modelName?: string;
  maxRequestsPerMinute?: number;
  rateLimitWindowMs?: number;
  timeoutMs?: number;
}

export interface BackendGatewayResult {
  statusCode: number;
  headers: Record<string, string>;
  body: AiGatewayResponse | { error: string; message: string; details?: any };
}

export interface IBackendAiGateway {
  handleRequest(
    payload: unknown,
    context?: {
      clientIp?: string;
      origin?: string;
      headers?: Record<string, string | string[] | undefined>;
    }
  ): Promise<BackendGatewayResult>;
}

export const BACKEND_ERROR_CODES = {
  RATE_LIMIT_EXCEEDED: 'AI_RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'AI_PAYLOAD_TOO_LARGE',
  MESSAGE_TOO_LONG: 'AI_MESSAGE_TOO_LONG',
  INVALID_REQUEST: 'AI_INVALID_REQUEST',
  AUTH_FAILURE: 'AI_AUTH_FAILURE',
  GATEWAY_NOT_CONFIGURED: 'AI_GATEWAY_NOT_CONFIGURED',
  PROVIDER_FAILURE: 'AI_PROVIDER_FAILURE',
  TIMEOUT: 'AI_TIMEOUT'
} as const;
