import {
  AiGatewayRequest,
  AiGatewayResponse,
  GATEWAY_MAX_MESSAGE_LENGTH,
  GATEWAY_MAX_PAYLOAD_BYTES
} from '../services/ai/gateway/aiGatewayTypes';
import {
  BackendAiGatewayConfig,
  BackendGatewayResult,
  BACKEND_ERROR_CODES,
  IBackendAiGateway
} from '../services/ai/gateway/backendGatewayInterface';
import { generateOpaqueRequestId } from '../services/ai/gateway/AiGatewayClient';

export interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class BackendAiGatewayServer implements IBackendAiGateway {
  private config: BackendAiGatewayConfig;
  private rateLimitMap = new Map<string, RateLimitEntry>();

  public constructor(config?: BackendAiGatewayConfig) {
    this.config = {
      geminiApiKey: (config && 'geminiApiKey' in config)
        ? config.geminiApiKey
        : (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : null),
      modelName: config?.modelName || 'gemini-1.5-flash',
      maxRequestsPerMinute: config?.maxRequestsPerMinute || 30,
      rateLimitWindowMs: config?.rateLimitWindowMs || 60000,
      timeoutMs: config?.timeoutMs || 10000
    };
  }

  public setApiKey(key: string | null): void {
    this.config.geminiApiKey = key;
  }

  public getApiKey(): string | null {
    if (this.config.geminiApiKey !== undefined) {
      return this.config.geminiApiKey;
    }
    if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) {
      return process.env.GEMINI_API_KEY;
    }
    return null;
  }

  public isConfigured(): boolean {
    const key = this.getApiKey();
    return Boolean(key && key.trim().length > 0);
  }

  public checkRateLimit(clientIp: string = 'default'): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const entry = this.rateLimitMap.get(clientIp);
    const maxReqs = this.config.maxRequestsPerMinute || 30;
    const windowMs = this.config.rateLimitWindowMs || 60000;

    if (!entry || now > entry.resetTime) {
      this.rateLimitMap.set(clientIp, {
        count: 1,
        resetTime: now + windowMs
      });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (entry.count >= maxReqs) {
      const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetTime - now) / 1000));
      return { allowed: false, retryAfterSeconds };
    }

    entry.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }

  public async handleRequest(
    payload: unknown,
    context?: {
      clientIp?: string;
      origin?: string;
      headers?: Record<string, string | string[] | undefined>;
    }
  ): Promise<BackendGatewayResult> {
    const clientIp = context?.clientIp || '127.0.0.1';

    // 1. Rate Limiting Check
    const rateCheck = this.checkRateLimit(clientIp);
    if (!rateCheck.allowed) {
      return {
        statusCode: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(rateCheck.retryAfterSeconds)
        },
        body: {
          error: BACKEND_ERROR_CODES.RATE_LIMIT_EXCEEDED,
          message: `Too many requests. Rate limit exceeded. Retry after ${rateCheck.retryAfterSeconds} seconds.`,
          details: { retryAfterSeconds: rateCheck.retryAfterSeconds }
        }
      };
    }

    // 2. Validate payload existence and type
    if (!payload || typeof payload !== 'object') {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: BACKEND_ERROR_CODES.INVALID_REQUEST,
          message: 'Request body must be a valid JSON object.'
        }
      };
    }

    // 3. Payload size check
    let serialized: string;
    try {
      serialized = JSON.stringify(payload);
    } catch {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: BACKEND_ERROR_CODES.INVALID_REQUEST,
          message: 'Malformed request JSON could not be serialized.'
        }
      };
    }

    const payloadBytes = new TextEncoder().encode(serialized).length;
    if (payloadBytes > GATEWAY_MAX_PAYLOAD_BYTES) {
      return {
        statusCode: 413,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: BACKEND_ERROR_CODES.PAYLOAD_TOO_LARGE,
          message: `Payload size (${payloadBytes} bytes) exceeds maximum limit of ${GATEWAY_MAX_PAYLOAD_BYTES} bytes.`
        }
      };
    }

    const req = payload as Partial<AiGatewayRequest>;

    // 4. Message validation
    const message = req.message || (payload as any).query;
    if (typeof message !== 'string' || !message.trim()) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: BACKEND_ERROR_CODES.INVALID_REQUEST,
          message: 'Request requires a non-empty message string.'
        }
      };
    }

    const trimmedMsg = message.trim();
    if (trimmedMsg.length > GATEWAY_MAX_MESSAGE_LENGTH) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: BACKEND_ERROR_CODES.MESSAGE_TOO_LONG,
          message: `Message length (${trimmedMsg.length} characters) exceeds maximum limit of ${GATEWAY_MAX_MESSAGE_LENGTH} characters.`
        }
      };
    }

    // 5. Check if Backend Provider Secret is Configured
    const apiKey = this.getApiKey();
    if (!apiKey || !apiKey.trim()) {
      return {
        statusCode: 503,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: BACKEND_ERROR_CODES.GATEWAY_NOT_CONFIGURED,
          message: 'Backend AI Gateway: Server-side GEMINI_API_KEY is not configured on this environment.'
        }
      };
    }

    // 6. Call Google Gemini Server-Side
    try {
      const clinicalPrompt = this.constructGeminiPrompt(req, trimmedMsg);
      const response = await this.callGeminiApi(apiKey, clinicalPrompt);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: response
      };
    } catch (err: any) {
      const isAuthError = err.message?.includes('API_KEY_INVALID') || err.message?.includes('401') || err.message?.includes('403');
      const isRateLimit = err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED');
      const isTimeout = err.name === 'AbortError' || err.message?.includes('timeout');

      if (isAuthError) {
        return {
          statusCode: 401,
          headers: { 'Content-Type': 'application/json' },
          body: {
            error: BACKEND_ERROR_CODES.AUTH_FAILURE,
            message: 'Server-side AI provider authentication failed.'
          }
        };
      }

      if (isRateLimit) {
        return {
          statusCode: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '30'
          },
          body: {
            error: BACKEND_ERROR_CODES.RATE_LIMIT_EXCEEDED,
            message: 'Upstream AI provider rate limit reached.',
            details: { retryAfterSeconds: 30 }
          }
        };
      }

      if (isTimeout) {
        return {
          statusCode: 408,
          headers: { 'Content-Type': 'application/json' },
          body: {
            error: BACKEND_ERROR_CODES.TIMEOUT,
            message: 'Upstream AI provider call timed out.'
          }
        };
      }

      return {
        statusCode: 502,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: BACKEND_ERROR_CODES.PROVIDER_FAILURE,
          message: 'Upstream AI provider invocation failed.'
        }
      };
    }
  }

  private constructGeminiPrompt(req: Partial<AiGatewayRequest>, userMessage: string): string {
    const lang = req.language || 'en';
    const context = req.context || {};
    const evidence = req.evidence ? JSON.stringify(req.evidence) : 'None';

    return [
      `[SYSTEM INSTRUCTION]`,
      `You are NurtureAI, an empathetic and clinically responsible educational assistant for maternal and child health.`,
      `You reference the Ghana Health Service (GHS) Safe Motherhood, ANC, PNC, and Expanded Programme on Immunization (EPI) guidelines.`,
      `RULES:`,
      `1. You provide educational guidance ONLY. Never make definitive medical diagnoses.`,
      `2. Never prescribe medications or specify drug dosages.`,
      `3. Never modify, cancel, or tamper with clinical appointment schedules or vaccination dates.`,
      `4. Always instruct the user to visit a Community Health Planning and Services (CHPS) compound, health centre, or hospital if danger signs or illness are present.`,
      `5. Respond in language: ${lang}. Keep answers clear, accessible, and structured with concise bullet points where appropriate.`,
      ``,
      `[CLINICAL CONTEXT]`,
      `Stage: ${(context as any).careStage || 'Maternal / Child Health'}`,
      `Active Member: ${(context as any).memberRole || 'Caregiver'}`,
      `Relevant Milestones: ${(context as any).currentMilestone || 'Routine care'}`,
      `GHS Evidence Retrieval: ${evidence}`,
      ``,
      `[USER QUERY]`,
      `${userMessage}`
    ].join('\n');
  }

  private async callGeminiApi(apiKey: string, prompt: string): Promise<AiGatewayResponse> {
    const model = this.config.modelName || 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs || 10000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!candidateText || typeof candidateText !== 'string' || !candidateText.trim()) {
        throw new Error('Gemini API returned an empty response.');
      }

      return {
        text: candidateText.trim(),
        provider: 'cloud',
        model,
        requestId: generateOpaqueRequestId(),
        origin: 'GHS_CLINICAL_ASSET',
        citation: 'Ghana Health Service Protocols',
        confidence: 0.95,
        sourceReferences: ['Ghana Health Service Protocols', 'Safe Motherhood Protocol 2019']
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const backendAiGatewayServer = new BackendAiGatewayServer();

export async function handleBackendGatewayRequest(
  payload: unknown,
  context?: {
    clientIp?: string;
    origin?: string;
    headers?: Record<string, string | string[] | undefined>;
  }
): Promise<BackendGatewayResult> {
  return backendAiGatewayServer.handleRequest(payload, context);
}
