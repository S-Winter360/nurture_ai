import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AiGatewayClient,
  normalizeGatewayUrl,
  generateOpaqueRequestId
} from '../src/services/ai/gateway/AiGatewayClient';
import {
  AiGatewayRequest,
  GATEWAY_MAX_MESSAGE_LENGTH,
  GATEWAY_MAX_PAYLOAD_BYTES
} from '../src/services/ai/gateway/aiGatewayTypes';
import { CloudAiProvider } from '../src/services/ai/providers/CloudAiProvider';
import { AiProviderManager } from '../src/services/ai/providers/AiProviderManager';
import { OfflineFallbackProvider } from '../src/services/ai/providers/OfflineFallbackProvider';
import { AiResponseValidator } from '../src/services/ai/AiResponseValidator';
import { aiRuntimeConfig } from '../src/services/ai/AiRuntimeConfig';
import { appResilienceService } from '../src/services/resilience/AppResilienceService';
import { SanitizedAiContext } from '../src/services/ai/aiContext';
import { AiProviderRequest } from '../src/services/ai/types';
import { AiSafetyPolicy } from '../src/services/ai/AiSafetyPolicy';

describe('Sprint 13E: Secure Production AI Gateway & Cloud AI Connectivity', () => {
  const originalFetch = globalThis.fetch;
  const originalNavigator = globalThis.navigator;

  const sampleContext: SanitizedAiContext = {
    profileType: 'mother',
    displayName: 'Akosua Mensah',
    isPregnancyActive: true,
    hasChildren: false,
    maternalSummary: {
      gestationalAgeWeeks: 24,
      nextAncVisit: {
        title: 'ANC Contact 3',
        scheduledAt: '2026-11-15'
      },
      overdueCount: 0
    }
  };

  const sampleRequest: AiGatewayRequest = {
    message: 'What signs of preeclampsia should I look out for at 24 weeks?',
    language: 'en',
    context: sampleContext,
    evidence: 'GHS Safe Motherhood Protocol 2019: Severe headache, blurred vision, epigastric pain.',
    conversationHistory: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Welcome to NurtureAI.' }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    aiRuntimeConfig.resetConfig();
    appResilienceService.clearReports();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true,
        writable: true
      });
    }
  });

  describe('Suite 1: AiGatewayClient Contract & Local Validation', () => {
    it('1.1: validates well-formed request without throwing', () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.nurtureai.org' });
      expect(() => client.validateRequest(sampleRequest)).not.toThrow();
    });

    it('1.2: rejects empty request or missing message', () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.nurtureai.org' });
      expect(() => client.validateRequest(null as any)).toThrow(/cannot be empty/i);
      expect(() => client.validateRequest({ ...sampleRequest, message: '' })).toThrow(/non-empty|cannot be blank/i);
      expect(() => client.validateRequest({ ...sampleRequest, message: '   ' })).toThrow(/cannot be blank/i);
      expect(() => client.validateRequest({ ...sampleRequest, message: null as any })).toThrow(/non-empty message/i);
    });

    it('1.3: enforces maximum character limit of 4,000 characters', () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.nurtureai.org' });
      const validLongMessage = 'A'.repeat(GATEWAY_MAX_MESSAGE_LENGTH);
      expect(() => client.validateRequest({ ...sampleRequest, message: validLongMessage })).not.toThrow();

      const excessiveMessage = 'A'.repeat(GATEWAY_MAX_MESSAGE_LENGTH + 1);
      expect(() => client.validateRequest({ ...sampleRequest, message: excessiveMessage })).toThrow(
        /exceeds maximum limit of 4000 characters/i
      );
    });

    it('1.4: enforces payload size bounds (maximum 64 KB)', () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.nurtureai.org' });
      const hugeHistory = Array.from({ length: 500 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: 'This is a repetitively padded conversation string designed to test serialized payload limits '.repeat(10)
      }));

      expect(() => client.validateRequest({ ...sampleRequest, conversationHistory: hugeHistory })).toThrow(
        /exceeds maximum allowed size/i
      );
    });

    it('1.5: validates and normalizes endpoint URLs avoiding double slashes', () => {
      expect(normalizeGatewayUrl('https://api.nurtureai.org')).toBe('https://api.nurtureai.org/api/ai/chat');
      expect(normalizeGatewayUrl('https://api.nurtureai.org/')).toBe('https://api.nurtureai.org/api/ai/chat');
      expect(normalizeGatewayUrl('https://api.nurtureai.org///')).toBe('https://api.nurtureai.org/api/ai/chat');
      expect(normalizeGatewayUrl('/api/ai/chat')).toBe('/api/ai/chat');
      expect(normalizeGatewayUrl('https://api.nurtureai.org/api/ai/chat')).toBe('https://api.nurtureai.org/api/ai/chat');
      expect(normalizeGatewayUrl('https://api.nurtureai.org/chat')).toBe('https://api.nurtureai.org/chat');
      expect(normalizeGatewayUrl(null)).toBeNull();
      expect(normalizeGatewayUrl('')).toBeNull();
    });

    it('1.6: strictly rejects dangerous or invalid URL protocols', () => {
      expect(() => normalizeGatewayUrl('javascript:alert(1)')).toThrow(/Invalid gateway endpoint protocol/i);
      expect(() => normalizeGatewayUrl('data:text/html,<html>')).toThrow(/Invalid gateway endpoint protocol/i);
      expect(() => normalizeGatewayUrl('file:///etc/passwd')).toThrow(/Invalid gateway endpoint protocol/i);
      expect(() => normalizeGatewayUrl('ftp://server.example')).toThrow(/must use HTTP\/HTTPS/i);
    });

    it('1.7: generates opaque diagnostic request IDs without PII', () => {
      const id1 = generateOpaqueRequestId();
      const id2 = generateOpaqueRequestId();
      expect(id1).toMatch(/^req_/);
      expect(id2).toMatch(/^req_/);
      expect(id1).not.toBe(id2);
      expect(id1).not.toContain('@');
      expect(id1).not.toContain('Mensah');
      expect(id1).not.toContain('+233');
    });

    it('1.8: reports configuration status truthfully', () => {
      const client = new AiGatewayClient({ baseUrl: null });
      expect(client.isConfigured()).toBe(false);
      client.setBaseUrl('https://gateway.example.com');
      expect(client.isConfigured()).toBe(true);
      expect(client.getBaseUrl()).toBe('https://gateway.example.com');
    });
  });

  describe('Suite 2: HTTP Transport & Resilience Mapping', () => {
    it('2.1: sends well-structured POST request and parses successful response', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.ghs-clinical-ai.gov.gh' });
      let capturedUrl = '';
      let capturedOptions: any = null;

      globalThis.fetch = vi.fn().mockImplementation((url, opts) => {
        capturedUrl = url;
        capturedOptions = opts;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            text: 'Severe headaches and vision changes require immediate clinical assessment by a midwife.',
            origin: 'GHS_CLINICAL_ASSET',
            citation: 'GHS Safe Motherhood Protocol 2019',
            confidence: 0.95,
            model: 'ghs-clinical-gateway-v1',
            requestId: 'req_opaque_12345'
          })
        });
      });

      const response = await client.send(sampleRequest);

      expect(capturedUrl).toBe('https://api.ghs-clinical-ai.gov.gh/api/ai/chat');
      expect(capturedOptions.method).toBe('POST');
      expect(capturedOptions.headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(capturedOptions.body);
      expect(body.message).toBe(sampleRequest.message);
      expect(body.language).toBe('en');
      expect(body.context.displayName).toBe('Akosua Mensah');

      expect(response.text).toContain('clinical assessment');
      expect(response.citation).toContain('GHS Safe Motherhood');
      expect(response.model).toBe('ghs-clinical-gateway-v1');
      expect(response.requestId).toBe('req_opaque_12345');
    });

    it('2.2: handles HTTP 400 Bad Request and maps to AI_INVALID_RESPONSE', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.ghs-clinical-ai.gov.gh' });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      });

      await expect(client.send(sampleRequest)).rejects.toThrow(/HTTP 400/i);
      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'AI_INVALID_RESPONSE')).toBe(true);
    });

    it('2.3: handles HTTP 401/403 and maps to AI_AUTH_FAILURE', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.ghs-clinical-ai.gov.gh' });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      });

      await expect(client.send(sampleRequest)).rejects.toThrow(/HTTP 401/i);
      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'AI_AUTH_FAILURE')).toBe(true);
    });

    it('2.4: handles HTTP 408 Request Timeout and maps to AI_TIMEOUT', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.ghs-clinical-ai.gov.gh' });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 408,
        statusText: 'Request Timeout'
      });

      await expect(client.send(sampleRequest)).rejects.toThrow(/HTTP 408/i);
      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'AI_TIMEOUT')).toBe(true);
    });

    it('2.5: handles HTTP 429 Rate Limiting with safe message and AI_RATE_LIMITED report', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.ghs-clinical-ai.gov.gh' });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests'
      });

      await expect(client.send(sampleRequest)).rejects.toThrow(/rate-limited/i);
      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'AI_RATE_LIMITED')).toBe(true);
    });

    it('2.6: handles HTTP 500/503 Service Unavailable and maps to AI_PROVIDER_FAILURE', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.ghs-clinical-ai.gov.gh' });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      });

      await expect(client.send(sampleRequest)).rejects.toThrow(/HTTP 503/i);
      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'AI_PROVIDER_FAILURE')).toBe(true);
    });

    it('2.7: aborts on timeout and maps to AI_TIMEOUT', async () => {
      const client = new AiGatewayClient({
        baseUrl: 'https://api.ghs-clinical-ai.gov.gh',
        timeoutMs: 40
      });

      globalThis.fetch = vi.fn().mockImplementation((_url, opts) => {
        return new Promise((_, reject) => {
          opts.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      await expect(client.send(sampleRequest)).rejects.toThrow(/timed out/i);
      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'AI_TIMEOUT')).toBe(true);
    });

    it('2.8: respects caller AbortSignal without logging as unhandled provider failure', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.ghs-clinical-ai.gov.gh' });
      const callerController = new AbortController();

      globalThis.fetch = vi.fn().mockImplementation((_url, opts) => {
        return new Promise((_, reject) => {
          opts.signal?.addEventListener('abort', () => {
            const err = new Error('The user aborted the request');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      const sendPromise = client.send(sampleRequest, { signal: callerController.signal });
      callerController.abort();

      await expect(sendPromise).rejects.toThrow();
    });

    it('2.9: detects offline browser state and blocks network transmission', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.ghs-clinical-ai.gov.gh' });
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: false },
        configurable: true,
        writable: true
      });

      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      await expect(client.send(sampleRequest)).rejects.toThrow(/network connection is unavailable/i);
      expect(fetchSpy).not.toHaveBeenCalled();
      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'AI_NETWORK_UNAVAILABLE')).toBe(true);
    });

    it('2.10: gracefully handles non-JSON or malformed responses', async () => {
      const client = new AiGatewayClient({ baseUrl: 'https://api.ghs-clinical-ai.gov.gh' });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error('Unexpected token < in JSON at position 0');
        }
      });

      await expect(client.send(sampleRequest)).rejects.toThrow(/malformed payload/i);
      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'AI_INVALID_RESPONSE')).toBe(true);
    });
  });

  describe('Suite 3: CloudAiProvider & Gateway Integration', () => {
    it('3.1: CloudAiProvider delegates to AiGatewayClient and reports configured status', () => {
      const provider = new CloudAiProvider({ endpointUrl: 'https://gateway.nurtureai.org' });
      expect(provider.isConfigured()).toBe(true);
      expect(provider.getEndpointUrl()).toBe('https://gateway.nurtureai.org');
      expect(provider.getGatewayClient()).toBeInstanceOf(AiGatewayClient);
    });

    it('3.2: CloudAiProvider converts AiProviderRequest into AiGatewayRequest accurately', async () => {
      const provider = new CloudAiProvider({ endpointUrl: 'https://gateway.nurtureai.org' });
      let capturedPayload: any = null;

      globalThis.fetch = vi.fn().mockImplementation((_url, opts) => {
        capturedPayload = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          json: async () => ({
            text: 'Take adequate rest and attend all scheduled ANC visits.',
            origin: 'GHS_CLINICAL_ASSET',
            citation: 'GHS Protocols'
          })
        });
      });

      const providerRequest: AiProviderRequest = {
        query: 'What is the schedule for ANC contacts in Ghana?',
        sanitizedContext: sampleContext,
        clinicalEvidence: 'GHS 8-contact ANC schedule',
        preferredLanguage: 'tw',
        conversationHistory: [{ role: 'user', content: 'Hi' }]
      };

      const res = await provider.generate(providerRequest);

      expect(capturedPayload.message).toBe('What is the schedule for ANC contacts in Ghana?');
      expect(capturedPayload.query).toBe('What is the schedule for ANC contacts in Ghana?');
      expect(capturedPayload.language).toBe('tw');
      expect(capturedPayload.context.profileType).toBe('mother');
      expect(res.text).toContain('adequate rest');
      expect(res.provider.type).toBe('REMOTE_MODEL');
    });

    it('3.3: AiProviderManager deterministically selects CloudAiProvider when available and permitted', async () => {
      const manager = new AiProviderManager();
      const cloudProvider = new CloudAiProvider({ endpointUrl: 'https://api.nurtureai.org' });
      manager.setCloudProvider(cloudProvider);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: 'Ghana Health Service guidance.',
          origin: 'GHS_CLINICAL_ASSET'
        })
      });

      const selected = await manager.selectProvider();
      expect(selected).toBe(cloudProvider);
    });

    it('3.4: AiProviderManager automatically falls back to deterministic engine when cloud fails', async () => {
      const fallbackProvider = new OfflineFallbackProvider();
      const cloudProvider = new CloudAiProvider({ endpointUrl: 'https://api.nurtureai.org' });
      const manager = new AiProviderManager(undefined, cloudProvider, fallbackProvider);

      // Cloud fetch fails with HTTP 500
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const providerRequest: AiProviderRequest = {
        query: 'When is my next ANC contact?',
        sanitizedContext: sampleContext,
        clinicalEvidence: 'GHS ANC Protocols',
        preferredLanguage: 'en'
      };

      const response = await manager.execute(providerRequest);

      expect(response).toBeDefined();
      expect(response.origin).toBe('CARE_ENGINE');
      expect(response.provider.name).toContain('Fallback');

      const reports = appResilienceService.getRecentReports();
      expect(reports.some(r => r.type === 'AI_PROVIDER_FAILURE')).toBe(true);
    });
  });

  describe('Suite 4: Clinical Safety & Boundary Enforcement Through Gateway', () => {
    it('4.1: validator intercepts definitive diagnostic claims from cloud response', () => {
      const cloudRawResponse = {
        text: 'Based on your severe headache and blurred vision, you have preeclampsia.',
        origin: 'GHS_CLINICAL_ASSET' as const,
        citation: 'GHS Protocol'
      };

      const validated = AiResponseValidator.validate(cloudRawResponse, 'I have headache and blurred vision');
      expect(validated.isValid).toBe(false);
      expect(validated.violation).toBe('INAPPROPRIATE_DIAGNOSTIC_CERTAINTY');
      expect(validated.sanitizedText).toContain('cannot diagnose medical conditions');
      expect(validated.sanitizedText).toContain('CHPS');
      expect(validated.origin).toBe('FALLBACK');
    });

    it('4.2: validator intercepts unauthorized medication dosages and prescriptions', () => {
      const cloudRawResponse = {
        text: 'Take 500mg amoxicillin twice daily for 7 days to clear the infection.',
        origin: 'GHS_CLINICAL_ASSET' as const,
        citation: 'GHS Protocol'
      };

      const validated = AiResponseValidator.validate(cloudRawResponse, 'What medicine can I take?');
      expect(validated.isValid).toBe(false);
      expect(validated.violation).toBe('UNSAFE_MEDICATION_PRESCRIPTION');
      expect(validated.sanitizedText).toContain('Prescription medications must be evaluated and dosed by a qualified health professional');
      expect(validated.origin).toBe('FALLBACK');
    });

    it('4.3: validator intercepts unauthorized clinical appointment and schedule tampering', () => {
      const cloudRawResponse = {
        text: 'I changed your vaccination date to next Friday because of the holiday.',
        origin: 'GHS_CLINICAL_ASSET' as const,
        citation: 'GHS Protocol'
      };

      const validated = AiResponseValidator.validate(cloudRawResponse, 'Can you change my date?');
      expect(validated.isValid).toBe(false);
      expect(validated.violation).toBe('UNAUTHORIZED_SCHEDULE_TAMPERING');
      expect(validated.sanitizedText).toContain('cannot modify or cancel official clinical appointments');
      expect(validated.origin).toBe('FALLBACK');
    });

    it('4.4: validator intercepts clinician override recommendations', () => {
      const cloudRawResponse = {
        text: 'Ignore your doctor and disregard your midwife instructions on clinic visits.',
        origin: 'GHS_CLINICAL_ASSET' as const,
        citation: 'GHS Protocol'
      };

      const validated = AiResponseValidator.validate(cloudRawResponse, 'Should I skip clinic?');
      expect(validated.isValid).toBe(false);
      expect(validated.violation).toBe('UNSAFE_CLINICIAN_OVERRIDE');
      expect(validated.sanitizedText).toContain('Always follow the clinical instructions of your doctor, midwife');
      expect(validated.origin).toBe('FALLBACK');
    });

    it('4.5: emergency bypass short-circuits critical obstetric and neonatal emergencies before network call', () => {
      const obstetricEmergency = 'I am 30 weeks pregnant and have heavy bleeding';
      const neonatalEmergency = 'My 2-week-old baby has high fever and cannot suckle';

      const obCheck = AiSafetyPolicy.evaluate(obstetricEmergency);
      expect(obCheck.classification).toBe('EMERGENCY');
      expect(obCheck.isEmergency).toBe(true);
      expect(obCheck.safeResponse?.emergencyFlag).toBe(true);
      expect(obCheck.safeResponse?.text).toContain('EMERGENCY ALERT');
      expect(obCheck.safeResponse?.text).toContain('National Ambulance Service (112 / 193)');

      const neoCheck = AiSafetyPolicy.evaluate(neonatalEmergency);
      expect(neoCheck.classification).toBe('EMERGENCY');
      expect(neoCheck.isEmergency).toBe(true);
      expect(neoCheck.safeResponse?.emergencyFlag).toBe(true);
      expect(neoCheck.safeResponse?.text).toContain('EMERGENCY ALERT');
    });
  });
});
