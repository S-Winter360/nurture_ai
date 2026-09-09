import { AiGatewayRequest, AiGatewayResponse } from './aiGatewayTypes';
import { generateOpaqueRequestId } from './AiGatewayClient';

export type MockGatewayBehavior =
  | { type: 'success'; response?: Partial<AiGatewayResponse>; delayMs?: number }
  | { type: 'network_error'; message?: string; delayMs?: number }
  | { type: 'timeout'; delayMs?: number }
  | { type: 'http_error'; status: number; statusText?: string; body?: any; delayMs?: number }
  | { type: 'malformed_json'; delayMs?: number }
  | { type: 'empty_response'; delayMs?: number };

/**
 * Development-safe mock adapter strictly for automated testing.
 * Implements full simulation of edge cases without contacting external servers.
 *
 * NOTE: This mock is for testing only and must NEVER be confused with or presented as production AI.
 */
export class MockGatewayAdapter {
  private behavior: MockGatewayBehavior = { type: 'success' };
  private recordedRequests: AiGatewayRequest[] = [];

  public setBehavior(behavior: MockGatewayBehavior): void {
    this.behavior = behavior;
  }

  public getRecordedRequests(): readonly AiGatewayRequest[] {
    return [...this.recordedRequests];
  }

  public clearRecordedRequests(): void {
    this.recordedRequests = [];
  }

  /**
   * Validates that the request sent to the mock contains zero PII or sensitive keys.
   */
  public assertNoPiiInRecordedRequests(): boolean {
    for (const req of this.recordedRequests) {
      const serialized = JSON.stringify(req);
      // Check phone numbers
      if (/\+?233[0-9]{9}/.test(serialized) || /\b0[235][0-9]{8}\b/.test(serialized)) {
        return false;
      }
      // Check emails
      if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(serialized)) {
        return false;
      }
      // Check internal IDs
      if (/\b(usr|fam|mem|evt|rem|vac)_[a-zA-Z0-9_-]+\b/.test(serialized)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Generates a standard mock fetch implementation to plug into global fetch during tests.
   */
  public createFetchMock(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      // Record incoming request
      if (init?.body && typeof init.body === 'string') {
        try {
          const parsed = JSON.parse(init.body);
          this.recordedRequests.push(parsed);
        } catch {
          // Ignore parse errors for malformed requests
        }
      }

      // Check abort signal
      if (init?.signal?.aborted) {
        const err = new Error('The operation was aborted.');
        err.name = 'AbortError';
        throw err;
      }

      const behavior = this.behavior;
      const delay = behavior.delayMs || 0;

      if (delay > 0) {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => resolve(), delay);
          if (init?.signal) {
            init.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              const err = new Error('The operation was aborted.');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      }

      switch (behavior.type) {
        case 'success': {
          const responseBody: AiGatewayResponse = {
            text: behavior.response?.text || 'Standard Ghana Health Service clinical guidance: Continue exclusive breastfeeding and attend regular child welfare clinic sessions.',
            provider: 'cloud',
            model: behavior.response?.model || 'cloud-clinical-v1',
            requestId: behavior.response?.requestId || generateOpaqueRequestId(),
            origin: behavior.response?.origin || 'GHS_CLINICAL_ASSET',
            citation: behavior.response?.citation || 'Ghana Health Service Protocols',
            confidence: behavior.response?.confidence ?? 0.95,
            sourceReferences: behavior.response?.sourceReferences || ['GHS Safe Motherhood Guidelines']
          };

          return new Response(JSON.stringify(responseBody), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        case 'network_error': {
          throw new TypeError(behavior.message || 'Failed to fetch');
        }

        case 'timeout': {
          const err = new Error('Request timed out.');
          err.name = 'AbortError';
          throw err;
        }

        case 'http_error': {
          const body = behavior.body !== undefined
            ? (typeof behavior.body === 'string' ? behavior.body : JSON.stringify(behavior.body))
            : JSON.stringify({ error: `HTTP_${behavior.status}`, message: behavior.statusText || 'Error' });

          return new Response(body, {
            status: behavior.status,
            statusText: behavior.statusText || 'Error',
            headers: { 'Content-Type': 'application/json' }
          });
        }

        case 'malformed_json': {
          return new Response('<html><body>502 Bad Gateway - HTML returned</body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          });
        }

        case 'empty_response': {
          return new Response(JSON.stringify({ text: '', requestId: generateOpaqueRequestId() }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    };
  }
}

export const mockGatewayAdapter = new MockGatewayAdapter();
