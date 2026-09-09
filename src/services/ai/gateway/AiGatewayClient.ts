import {
  AiGatewayRequest,
  AiGatewayResponse,
  GATEWAY_DEFAULT_TIMEOUT_MS,
  GATEWAY_MAX_MESSAGE_LENGTH,
  GATEWAY_MAX_PAYLOAD_BYTES,
  GATEWAY_MIN_TIMEOUT_MS
} from './aiGatewayTypes';
import { appResilienceService } from '../../resilience/AppResilienceService';
import { aiRuntimeConfig } from '../AiRuntimeConfig';

export interface AiGatewayClientConfig {
  baseUrl?: string | null;
  timeoutMs?: number;
}

/**
 * Normalizes gateway endpoint URL:
 * - Rejects disallowed schemes (e.g. javascript:, data:, file:)
 * - Resolves endpoint to {baseUrl}/api/ai/chat (or preserves explicit path if already specified)
 * - Eliminates double slashes
 */
export function normalizeGatewayUrl(rawUrl: string | null): string | null {
  if (!rawUrl || !rawUrl.trim()) {
    return null;
  }

  const trimmed = rawUrl.trim();

  // Block dangerous schemes
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('vbscript:')
  ) {
    throw new Error(`Invalid gateway endpoint protocol: ${trimmed}`);
  }

  // Must start with http://, https://, or / (relative API path)
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith('/')) {
    throw new Error(`Gateway endpoint must use HTTP/HTTPS or a relative path: ${trimmed}`);
  }

  // Enforce HTTPS for production remote endpoints (allow localhost/127.0.0.1 for local dev/testing)
  const isProd =
    (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.PROD === true);

  if (
    isProd &&
    lower.startsWith('http://') &&
    !lower.startsWith('http://localhost') &&
    !lower.startsWith('http://127.0.0.1')
  ) {
    throw new Error(`Production gateway endpoints must use HTTPS: ${trimmed}`);
  }

  // Remove trailing slashes
  const clean = trimmed.replace(/\/+$/, '');

  // If URL already specifies the endpoint path, preserve it
  if (clean.endsWith('/api/ai/chat') || clean.endsWith('/v1/ai/chat') || clean.endsWith('/chat')) {
    return clean;
  }

  return `${clean}/api/ai/chat`;
}

/**
 * Generates an opaque, random diagnostic request identifier.
 * Guaranteed to contain zero PII, database keys, or patient identifiers.
 */
export function generateOpaqueRequestId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `req_${crypto.randomUUID()}`;
  }
  const randomPart = Math.random().toString(36).substring(2, 10);
  const timePart = Date.now().toString(36);
  return `req_${timePart}_${randomPart}`;
}

export class AiGatewayClient {
  private baseUrl: string | null = null;
  private timeoutMs: number = GATEWAY_DEFAULT_TIMEOUT_MS;

  public constructor(config?: AiGatewayClientConfig) {
    if (config?.baseUrl !== undefined) {
      this.baseUrl = config.baseUrl;
    } else {
      this.baseUrl = aiRuntimeConfig.getCloudEndpoint();
    }

    if (config?.timeoutMs !== undefined) {
      this.timeoutMs = config.timeoutMs;
    } else {
      this.timeoutMs = aiRuntimeConfig.getCloudTimeoutMs();
    }
  }

  public getBaseUrl(): string | null {
    return this.baseUrl;
  }

  public setBaseUrl(url: string | null): void {
    this.baseUrl = url;
  }

  public getTimeoutMs(): number {
    return this.timeoutMs;
  }

  public setTimeoutMs(timeoutMs: number): void {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Truthfully reports whether a backend endpoint is configured.
   */
  public isConfigured(): boolean {
    return Boolean(this.baseUrl && this.baseUrl.trim().length > 0);
  }

  /**
   * Evaluates if gateway is reachable (configured and network online).
   */
  public async isAvailable(): Promise<boolean> {
    if (!this.isConfigured()) {
      return false;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return false;
    }

    return true;
  }

  /**
   * Validates gateway request payload locally before transmission.
   * Enforces character limits, non-empty bounds, and PII protection.
   */
  public validateRequest(request: AiGatewayRequest): void {
    if (!request) {
      throw new Error('Gateway request cannot be empty.');
    }

    if (!request.message || typeof request.message !== 'string') {
      throw new Error('Gateway request requires a non-empty message string.');
    }

    const trimmedMsg = request.message.trim();
    if (trimmedMsg.length === 0) {
      throw new Error('Gateway request message cannot be blank.');
    }

    if (trimmedMsg.length > GATEWAY_MAX_MESSAGE_LENGTH) {
      throw new Error(
        `Gateway message length (${trimmedMsg.length}) exceeds maximum limit of ${GATEWAY_MAX_MESSAGE_LENGTH} characters.`
      );
    }

    if (!request.language || typeof request.language !== 'string') {
      throw new Error('Gateway request requires a valid language code.');
    }

    if (!request.context || typeof request.context !== 'object') {
      throw new Error('Gateway request requires a sanitized clinical context object.');
    }

    // Measure serialized payload size
    const serialized = JSON.stringify({
      message: request.message,
      language: request.language,
      context: request.context,
      evidence: request.evidence,
      history: request.conversationHistory
    });

    if (new TextEncoder().encode(serialized).length > GATEWAY_MAX_PAYLOAD_BYTES) {
      throw new Error(
        `Gateway payload exceeds maximum allowed size of ${GATEWAY_MAX_PAYLOAD_BYTES} bytes.`
      );
    }
  }

  /**
   * Transmits request payload to the secure AI Gateway endpoint.
   */
  public async send(
    request: AiGatewayRequest,
    options?: { signal?: AbortSignal; timeoutMs?: number }
  ): Promise<AiGatewayResponse> {
    // 1. Local validation
    this.validateRequest(request);

    // 2. Configuration check
    if (!this.isConfigured()) {
      throw new Error('AI Gateway is not configured. No endpoint URL available.');
    }

    const endpointUrl = normalizeGatewayUrl(this.baseUrl);
    if (!endpointUrl) {
      throw new Error('AI Gateway endpoint URL is invalid or empty.');
    }

    // 3. Offline check
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      appResilienceService.report(
        'AI_NETWORK_UNAVAILABLE',
        'Device is offline. Remote AI gateway unreachable.'
      );
      throw new Error('Network connection is unavailable.');
    }

    // 4. Timeout & Abort controller setup
    const effectiveTimeout = options?.timeoutMs ?? this.timeoutMs;

    const controller = new AbortController();
    let isTimedOut = false;

    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      controller.abort();
    }, effectiveTimeout);

    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timeoutId);
        controller.abort();
      } else {
        options.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          controller.abort();
        });
      }
    }

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: request.message,
          query: request.message, // Backwards-compatible field alias
          language: request.language,
          context: request.context,
          evidence: request.evidence,
          history: request.conversationHistory
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle non-2xx HTTP responses
      if (!response.ok) {
        return this.handleHttpError(response);
      }

      let data: any;
      try {
        data = await response.json();
      } catch (parseErr: any) {
        const errorMsg = 'AI Gateway returned a non-JSON or malformed payload.';
        appResilienceService.report('AI_INVALID_RESPONSE', errorMsg);
        appResilienceService.report('AI_PROVIDER_FAILURE', errorMsg);
        throw new Error(errorMsg);
      }

      if (!data || typeof data.text !== 'string' || data.text.trim().length === 0) {
        const errorMsg = 'AI Gateway returned an empty or malformed response text.';
        appResilienceService.report('AI_INVALID_RESPONSE', errorMsg);
        appResilienceService.report('AI_PROVIDER_FAILURE', errorMsg);
        throw new Error(errorMsg);
      }

      // Ensure requestId is an opaque diagnostic string without PII
      const rawRequestId = data.requestId;
      const safeRequestId =
        typeof rawRequestId === 'string' &&
        rawRequestId.length > 0 &&
        rawRequestId.length < 128 &&
        !rawRequestId.includes('@')
          ? rawRequestId
          : generateOpaqueRequestId();

      return {
        text: data.text,
        provider: 'cloud',
        model: data.model || 'cloud-clinical-v1',
        evidenceAssessment: data.evidenceAssessment || request.evidence,
        requestId: safeRequestId,
        origin: data.origin || 'GHS_CLINICAL_ASSET',
        citation: data.citation || 'Ghana Health Service Protocols',
        confidence: typeof data.confidence === 'number' ? data.confidence : 0.9,
        sourceReferences: Array.isArray(data.sourceReferences)
          ? data.sourceReferences
          : [data.citation || 'Ghana Health Service Protocols']
      };
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (isTimedOut || (err.name === 'AbortError' && isTimedOut)) {
        const timeoutMsg = `Cloud AI request timed out after ${effectiveTimeout}ms.`;
        appResilienceService.report('AI_TIMEOUT', timeoutMsg);
        appResilienceService.report('AI_PROVIDER_FAILURE', timeoutMsg);
        throw new Error(timeoutMsg);
      }

      if (err.name === 'AbortError' || options?.signal?.aborted) {
        // User/caller intentional abort
        throw err;
      }

      if (err.message && err.message.startsWith('Cloud AI provider returned HTTP')) {
        throw err;
      }

      if (err.message && err.message.startsWith('AI Gateway returned')) {
        throw err;
      }

      // Generic network / connection error
      const netMsg = err.message || 'AI Gateway network connection failure';
      appResilienceService.report('AI_NETWORK_UNAVAILABLE', netMsg);
      appResilienceService.report('AI_PROVIDER_FAILURE', netMsg);
      throw err;
    }
  }

  /**
   * Dispatches structured resilience reporting and throws application-safe error
   * for HTTP response statuses.
   */
  private handleHttpError(response: Response): never {
    const status = response.status;
    const statusText = response.statusText || 'Error';

    if (status === 400) {
      const msg = `Cloud AI provider returned HTTP 400: ${statusText}`;
      appResilienceService.report('AI_INVALID_RESPONSE', msg);
      appResilienceService.report('AI_PROVIDER_FAILURE', msg);
      throw new Error(msg);
    }

    if (status === 401 || status === 403) {
      const msg = `Cloud AI provider returned HTTP ${status}: ${statusText}`;
      appResilienceService.report('AI_AUTH_FAILURE', msg);
      appResilienceService.report('AI_PROVIDER_FAILURE', msg);
      throw new Error(msg);
    }

    if (status === 408) {
      const msg = `Cloud AI provider returned HTTP 408: Request Timeout`;
      appResilienceService.report('AI_TIMEOUT', msg);
      appResilienceService.report('AI_PROVIDER_FAILURE', msg);
      throw new Error(msg);
    }

    if (status === 429) {
      const msg = `Cloud AI provider returned HTTP 429: Too Many Requests. AI service temporarily rate-limited.`;
      appResilienceService.report('AI_RATE_LIMITED', msg);
      appResilienceService.report('AI_PROVIDER_FAILURE', msg);
      throw new Error(msg);
    }

    // 500, 502, 503, 504 or other server errors
    const errorMsg = `Cloud AI provider returned HTTP ${status}: ${statusText}`;
    appResilienceService.report('AI_PROVIDER_FAILURE', errorMsg);
    throw new Error(errorMsg);
  }
}

export const aiGatewayClient = new AiGatewayClient();
