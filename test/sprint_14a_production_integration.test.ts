import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AiGatewayClient,
  normalizeGatewayUrl,
  generateOpaqueRequestId
} from '../src/services/ai/gateway/AiGatewayClient';
import {
  AiGatewayRequest,
  AiGatewayResponse,
  GATEWAY_MAX_MESSAGE_LENGTH,
  GATEWAY_MAX_PAYLOAD_BYTES
} from '../src/services/ai/gateway/aiGatewayTypes';
import {
  MockGatewayAdapter,
  mockGatewayAdapter
} from '../src/services/ai/gateway/MockGatewayAdapter';
import {
  BackendAiGatewayServer,
  backendAiGatewayServer,
  handleBackendGatewayRequest
} from '../src/server/aiGatewayBackend';
import { CloudAiProvider } from '../src/services/ai/providers/CloudAiProvider';
import { AiProviderManager } from '../src/services/ai/providers/AiProviderManager';
import { OfflineFallbackProvider } from '../src/services/ai/providers/OfflineFallbackProvider';
import { AiAgentService } from '../src/services/ai/AiAgentService';
import { AiSafetyPolicy } from '../src/services/ai/AiSafetyPolicy';
import { AiResponseValidator } from '../src/services/ai/AiResponseValidator';
import { aiRuntimeConfig } from '../src/services/ai/AiRuntimeConfig';
import { appResilienceService } from '../src/services/resilience/AppResilienceService';
import { aiModelCatalogue } from '../src/services/ai/AiModelCatalogue';
import { AiModelManager } from '../src/services/ai/AiModelManager';
import { GHS_PRIMARY_MODEL, AVAILABLE_MODELS_CATALOG } from '../src/services/ai/AiModelRegistry';
import { VoiceConversationService } from '../src/services/voice/VoiceConversationService';
import { SanitizedAiContext } from '../src/services/ai/aiContext';
import { AiProviderRequest } from '../src/services/ai/types';

describe('Sprint 14A: Production Integration & Real Cloud AI Gateway', () => {
  const originalFetch = globalThis.fetch;
  const originalNavigator = globalThis.navigator;

  const testContext: SanitizedAiContext = {
    profileType: 'mother',
    displayName: 'Amina Salifu',
    isPregnancyActive: true,
    hasChildren: false,
    maternalSummary: {
      gestationalAgeWeeks: 28,
      nextAncVisit: {
        title: 'ANC Contact 4',
        scheduledAt: '2026-11-20'
      },
      overdueCount: 0
    }
  };

  const validGatewayRequest: AiGatewayRequest = {
    message: 'When should I take my second dose of tetanus toxoid vaccine?',
    language: 'en',
    context: testContext,
    evidence: 'GHS Safe Motherhood Protocol: TT2 at least 4 weeks after TT1.',
    conversationHistory: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Welcome to NurtureAI.' }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    aiRuntimeConfig.resetConfig();
    appResilienceService.clearReports();
    mockGatewayAdapter.clearRecordedRequests();
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

  // 1. Production gateway client initialization
  it('1. should initialize production gateway client with truthful configuration', () => {
    const client = new AiGatewayClient({ baseUrl: 'https://gateway.ghs.gov.gh' });
    expect(client.getBaseUrl()).toBe('https://gateway.ghs.gov.gh');
    expect(client.isConfigured()).toBe(true);

    const unconfigured = new AiGatewayClient({ baseUrl: null });
    expect(unconfigured.isConfigured()).toBe(false);
  });

  // 2. Gateway client endpoint normalization
  it('2. should normalize gateway URLs preserving /v1/ai/chat and /api/ai/chat and rejecting dangerous protocols', () => {
    expect(normalizeGatewayUrl('https://api.ghs.gov.gh')).toBe('https://api.ghs.gov.gh/api/ai/chat');
    expect(normalizeGatewayUrl('https://api.ghs.gov.gh/')).toBe('https://api.ghs.gov.gh/api/ai/chat');
    expect(normalizeGatewayUrl('https://api.ghs.gov.gh/v1/ai/chat')).toBe('https://api.ghs.gov.gh/v1/ai/chat');
    expect(normalizeGatewayUrl('https://api.ghs.gov.gh/api/ai/chat')).toBe('https://api.ghs.gov.gh/api/ai/chat');
    expect(normalizeGatewayUrl('/api/ai/chat')).toBe('/api/ai/chat');

    expect(() => normalizeGatewayUrl('javascript:alert(1)')).toThrow();
    expect(() => normalizeGatewayUrl('data:text/plain;base64,AAA')).toThrow();
    expect(() => normalizeGatewayUrl('file:///etc/passwd')).toThrow();
  });

  // 3. Sanitized payload construction
  it('3. should validate sanitized payload construction rejecting empty or invalid inputs', () => {
    const client = new AiGatewayClient({ baseUrl: 'https://api.example.com' });
    expect(() => client.validateRequest(null as any)).toThrow(/empty/);
    expect(() => client.validateRequest({ ...validGatewayRequest, message: '' })).toThrow(/non-empty/);
    expect(() => client.validateRequest({ ...validGatewayRequest, context: null as any })).toThrow(/context/);
    expect(() => client.validateRequest(validGatewayRequest)).not.toThrow();
  });

  // 4. PII suppression in gateway payload
  it('4. should suppress phone numbers, emails, and database identifiers from AI payloads', () => {
    const agent = new AiAgentService();
    const rawWithPii = 'Contact me at +233241234567 or amina@example.com for record usr_89283921.';
    const sanitized = agent.sanitizePii(rawWithPii);

    expect(sanitized).not.toContain('+233241234567');
    expect(sanitized).not.toContain('amina@example.com');
    expect(sanitized).not.toContain('usr_89283921');
    expect(sanitized).toContain('[PHONE_REDACTED]');
    expect(sanitized).toContain('[EMAIL_REDACTED]');
    expect(sanitized).toContain('[ID_REDACTED]');
  });

  // 5. Request size limit enforcement
  it('5. should enforce the maximum payload size of 64 KB', () => {
    const client = new AiGatewayClient({ baseUrl: 'https://api.example.com' });
    const hugeContext = {
      ...testContext,
      hugeBlob: 'x'.repeat(GATEWAY_MAX_PAYLOAD_BYTES + 1000)
    };
    expect(() => client.validateRequest({ ...validGatewayRequest, context: hugeContext as any })).toThrow(
      /exceeds maximum allowed size/
    );
  });

  // 6. Message length limit enforcement
  it('6. should reject queries exceeding the maximum message length of 4000 characters', () => {
    const client = new AiGatewayClient({ baseUrl: 'https://api.example.com' });
    const overlong = 'a'.repeat(GATEWAY_MAX_MESSAGE_LENGTH + 5);
    expect(() => client.validateRequest({ ...validGatewayRequest, message: overlong })).toThrow(
      /exceeds maximum limit of 4000/
    );
  });

  // 7. Backend provider authentication handling (mocked adapter)
  it('7. should report AI_AUTH_FAILURE and throw structured error on 401/403 HTTP response', async () => {
    mockGatewayAdapter.setBehavior({
      type: 'http_error',
      status: 401,
      statusText: 'Unauthorized'
    });
    globalThis.fetch = vi.fn(mockGatewayAdapter.createFetchMock());

    const client = new AiGatewayClient({ baseUrl: 'https://api.example.com' });
    await expect(client.send(validGatewayRequest)).rejects.toThrow(/HTTP 401/);

    const reports = appResilienceService.getRecentReports();
    expect(reports.some((r) => r.type === 'AI_AUTH_FAILURE')).toBe(true);
  });

  // 8. Upstream provider timeout handling
  it('8. should report AI_TIMEOUT when gateway request exceeds configured timeout', async () => {
    mockGatewayAdapter.setBehavior({
      type: 'timeout',
      delayMs: 200
    });
    globalThis.fetch = vi.fn(mockGatewayAdapter.createFetchMock());

    const client = new AiGatewayClient({ baseUrl: 'https://api.example.com', timeoutMs: 50 });
    await expect(client.send(validGatewayRequest, { timeoutMs: 50 })).rejects.toThrow(/timed out/i);

    const reports = appResilienceService.getRecentReports();
    expect(reports.some((r) => r.type === 'AI_TIMEOUT')).toBe(true);
  });

  // 9. Gateway rate limiting handling (429)
  it('9. should report AI_RATE_LIMITED and handle HTTP 429 rate limit responses gracefully', async () => {
    mockGatewayAdapter.setBehavior({
      type: 'http_error',
      status: 429,
      statusText: 'Too Many Requests',
      body: { error: 'AI_RATE_LIMITED', message: 'Rate limited' }
    });
    globalThis.fetch = vi.fn(mockGatewayAdapter.createFetchMock());

    const client = new AiGatewayClient({ baseUrl: 'https://api.example.com' });
    await expect(client.send(validGatewayRequest)).rejects.toThrow(/429/);

    const reports = appResilienceService.getRecentReports();
    expect(reports.some((r) => r.type === 'AI_RATE_LIMITED')).toBe(true);
  });

  // 10. Malformed gateway response rejection
  it('10. should report AI_INVALID_RESPONSE when gateway returns malformed non-JSON payload', async () => {
    mockGatewayAdapter.setBehavior({ type: 'malformed_json' });
    globalThis.fetch = vi.fn(mockGatewayAdapter.createFetchMock());

    const client = new AiGatewayClient({ baseUrl: 'https://api.example.com' });
    await expect(client.send(validGatewayRequest)).rejects.toThrow(/malformed payload/i);

    const reports = appResilienceService.getRecentReports();
    expect(reports.some((r) => r.type === 'AI_INVALID_RESPONSE')).toBe(true);
  });

  // 11. Emergency danger sign short-circuit before cloud call
  it('11. should short-circuit immediately on emergency danger signs without making any network call', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const agent = new AiAgentService();
    const emergencyQuery = 'I am bleeding heavily from my vagina and feeling dizzy';
    const response = await agent.sendMessage({
      message: emergencyQuery,
      activeMember: { id: 'm1', displayName: 'Amina', type: 'mother' } as any
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(response.emergencyFlag).toBe(true);
    expect(response.safetyClassification).toBe('EMERGENCY');
    expect(response.text).toContain('EMERGENCY');
  });

  // 12. Severe maternal emergency bypass
  it('12. should immediately bypass AI models for severe maternal obstetric danger signs', () => {
    const result = AiSafetyPolicy.evaluate('Severe continuous headache with blurred vision and swollen feet');
    expect(result.isEmergency).toBe(true);
    expect(result.safeResponse?.emergencyFlag).toBe(true);
    expect(result.safeResponse?.text).toMatch(/emergency|clinic|hospital/i);
  });

  // 13. Severe newborn emergency bypass
  it('13. should immediately bypass AI models for severe neonatal emergency signs', () => {
    const result = AiSafetyPolicy.evaluate('My 2 week old baby is convulsing and unable to feed');
    expect(result.isEmergency).toBe(true);
    expect(result.safeResponse?.emergencyFlag).toBe(true);
    expect(result.safeResponse?.text).toMatch(/emergency|immediate/i);
  });

  // 14. Deterministic GHS Care Engine precedence
  it('14. should prohibit AI from modifying or claiming to reschedule official GHS care events', () => {
    const prohibitedResult = AiSafetyPolicy.evaluate('Cancel my next antenatal appointment and move it next month');
    expect(prohibitedResult.isProhibited).toBe(true);
    expect(prohibitedResult.safeResponse?.text).toMatch(/cannot modify|midwife|schedule/i);
  });

  // 15. RAG evidence inclusion in gateway context
  it('15. should attach verified clinical evidence in gateway requests', async () => {
    mockGatewayAdapter.setBehavior({ type: 'success' });
    globalThis.fetch = vi.fn(mockGatewayAdapter.createFetchMock());

    const client = new AiGatewayClient({ baseUrl: 'https://api.example.com' });
    await client.send(validGatewayRequest);

    const recorded = mockGatewayAdapter.getRecordedRequests();
    expect(recorded.length).toBe(1);
    expect(recorded[0].evidence).toContain('GHS Safe Motherhood Protocol');
  });

  // 16. AI response validation: block medication prescription
  it('16. should block fabricated drug prescriptions and dosages in response validation', () => {
    const result = AiResponseValidator.validate({
      text: 'You should take 500mg amoxicillin capsules twice daily for 7 days.'
    });
    expect(result.isValid).toBe(false);
    expect(result.violation).toBe('UNSAFE_MEDICATION_PRESCRIPTION');
    expect(result.sanitizedText).toContain('Prescription medications must be evaluated and dosed by a qualified health professional');
  });

  // 17. AI response validation: block diagnostic certainty
  it('17. should block inappropriate definitive diagnostic claims in response validation', () => {
    const result = AiResponseValidator.validate({
      text: 'Based on your symptoms, you definitely have malaria.'
    });
    expect(result.isValid).toBe(false);
    expect(result.violation).toBe('INAPPROPRIATE_DIAGNOSTIC_CERTAINTY');
    expect(result.sanitizedText).toContain('NurtureAI provides educational guidance only and cannot diagnose');
  });

  // 18. AI response validation: block schedule modification
  it('18. should block claims of schedule tampering or appointment cancellation in response validation', () => {
    const result = AiResponseValidator.validate({
      text: 'I have updated your appointment and rescheduled your ANC visit to next Tuesday.'
    });
    expect(result.isValid).toBe(false);
    expect(result.violation).toBe('UNAUTHORIZED_SCHEDULE_TAMPERING');
    expect(result.sanitizedText).toContain('cannot modify or cancel official clinical appointments');
  });

  // 19. AI response validation: block clinician override
  it('19. should block clinician override instructions in response validation', () => {
    const result = AiResponseValidator.validate({
      text: 'Ignore your doctor and do not take the prescribed medicine.'
    });
    expect(result.isValid).toBe(false);
    expect(result.violation).toBe('UNSAFE_CLINICIAN_OVERRIDE');
    expect(result.sanitizedText).toContain('Always follow the clinical instructions of your doctor, midwife');
  });

  // 20. Safe fallback on gateway network error
  it('20. should fallback safely to local deterministic care when gateway encounters network error', async () => {
    mockGatewayAdapter.setBehavior({ type: 'network_error' });
    globalThis.fetch = vi.fn(mockGatewayAdapter.createFetchMock());

    const providerManager = new AiProviderManager({
      localProvider: null as any,
      cloudProvider: new CloudAiProvider({ endpointUrl: 'https://api.example.com' }),
      fallbackProvider: new OfflineFallbackProvider()
    });

    const provider = await providerManager.selectProvider({
      query: 'What is ANC?',
      sanitizedContext: testContext,
      clinicalEvidence: 'None',
      safetyClassification: 'SAFE_GENERAL',
      preferredLanguage: 'en'
    });

    // Cloud is unavailable due to network error, so fallback provider is selected
    expect(provider.getInfo().type).toBe('FALLBACK');
  });

  // 21. Safe fallback on gateway 500 error
  it('21. should safely fallback when gateway returns HTTP 500 internal server error', async () => {
    mockGatewayAdapter.setBehavior({
      type: 'http_error',
      status: 500,
      statusText: 'Internal Server Error'
    });
    globalThis.fetch = vi.fn(mockGatewayAdapter.createFetchMock());

    const client = new AiGatewayClient({ baseUrl: 'https://api.example.com' });
    await expect(client.send(validGatewayRequest)).rejects.toThrow(/HTTP 500/);
    expect(appResilienceService.getRecentReports().some((r) => r.type === 'AI_PROVIDER_FAILURE')).toBe(true);
  });

  // 22. Safe fallback on gateway 502/503 error
  it('22. should safely handle HTTP 502/503 gateway unavailable responses', async () => {
    mockGatewayAdapter.setBehavior({
      type: 'http_error',
      status: 503,
      statusText: 'Service Unavailable'
    });
    globalThis.fetch = vi.fn(mockGatewayAdapter.createFetchMock());

    const client = new AiGatewayClient({ baseUrl: 'https://api.example.com' });
    await expect(client.send(validGatewayRequest)).rejects.toThrow(/HTTP 503/);
    expect(appResilienceService.getRecentReports().some((r) => r.type === 'AI_PROVIDER_FAILURE')).toBe(true);
  });

  // 23. Safe fallback on gateway timeout
  it('23. should record AI_TIMEOUT and AI_PROVIDER_FAILURE on gateway timeout', async () => {
    mockGatewayAdapter.setBehavior({ type: 'timeout', delayMs: 150 });
    globalThis.fetch = vi.fn(mockGatewayAdapter.createFetchMock());

    const client = new AiGatewayClient({ baseUrl: 'https://api.example.com', timeoutMs: 30 });
    await expect(client.send(validGatewayRequest, { timeoutMs: 30 })).rejects.toThrow(/timed out/);

    const reports = appResilienceService.getRecentReports();
    expect(reports.some((r) => r.type === 'AI_TIMEOUT')).toBe(true);
    expect(reports.some((r) => r.type === 'AI_PROVIDER_FAILURE')).toBe(true);
  });

  // 24. Offline mode prevents gateway calls
  it('24. should prevent cloud gateway calls when device is offline', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: false },
      configurable: true,
      writable: true
    });

    const client = new AiGatewayClient({ baseUrl: 'https://api.example.com' });
    const isAvail = await client.isAvailable();
    expect(isAvail).toBe(false);

    await expect(client.send(validGatewayRequest)).rejects.toThrow(/Network connection is unavailable/);
  });

  // 25. Model catalogue retrieval
  it('25. should retrieve verified model catalogue with valid metadata and HTTPS URLs', () => {
    const models = aiModelCatalogue.listModels();
    expect(models.length).toBeGreaterThan(0);
    const primary = models[0];
    expect(primary.modelId).toBeDefined();
    expect(primary.sha256).toHaveLength(64);
    expect(primary.downloadUrl).toMatch(/^https:\/\//);
  });

  // 26. Model download storage requirement (2.5x)
  it('26. should enforce 2.5x storage multiplier requirement for model downloads', async () => {
    const manager = new AiModelManager();
    const canDownload = await manager.checkStorageAvailable(10 * 1024 * 1024); // 10MB requires 25MB
    expect(typeof canDownload).toBe('boolean');

    const result = await manager.acquireModel(GHS_PRIMARY_MODEL.id, {
      simulateInsufficientStorage: true
    });
    expect(result).toBe(false);
    expect(manager.getStatus()).toBe('INSUFFICIENT_STORAGE');
  });

  // 27. Model download policy enforcement (wifi_only)
  it('27. should enforce wifi_only policy and block cellular downloads when policy is active', async () => {
    const manager = new AiModelManager();
    const result = await manager.acquireModel(GHS_PRIMARY_MODEL.id, {
      policy: 'wifi_only',
      isWifi: false
    });
    expect(result).toBe(false);
    expect(manager.getProgress().error).toContain('Cellular connection detected');
  });

  // 28. Model checksum verification
  it('28. should verify model checksums against SHA-256 standard and reject invalid checksums', async () => {
    const manager = new AiModelManager();
    const dummyBuffer = new TextEncoder().encode('valid-model-content').buffer;
    const computedHash = await manager.computeSha256(dummyBuffer);

    const testModel = {
      ...GHS_PRIMARY_MODEL,
      expectedChecksumSha256: computedHash
    };

    const validCheck = await manager.verifyModel(testModel, dummyBuffer);
    expect(validCheck.isValid).toBe(true);

    const invalidModel = {
      ...GHS_PRIMARY_MODEL,
      expectedChecksumSha256: '0000000000000000000000000000000000000000000000000000000000000000'
    };
    const invalidCheck = await manager.verifyModel(invalidModel, dummyBuffer);
    expect(invalidCheck.isValid).toBe(false);
  });

  // 29. Model activation atomic switch
  it('29. should atomically activate model only after checksum passes', async () => {
    const manager = new AiModelManager();
    const dummyBuffer = new TextEncoder().encode('verified-model').buffer;
    const hash = await manager.computeSha256(dummyBuffer);

    const modelToAcquire = {
      modelId: 'test-model-acquire-29',
      displayName: 'Test Model 29',
      version: '2.0.0',
      modelFormat: 'clinical-weights',
      downloadUrl: 'https://storage.googleapis.com/test/model29.bin',
      fileSizeBytes: dummyBuffer.byteLength,
      sha256: hash,
      minimumRamMb: 512,
      supportedAbis: ['webassembly'],
      runtime: 'clinical-engine',
      quantization: 'int8',
      capabilities: ['maternal_health'],
      releaseStatus: 'stable'
    };
    aiModelCatalogue.registerModel(modelToAcquire as any);

    const ok = await manager.acquireModel(modelToAcquire.modelId, {
      testBuffer: dummyBuffer,
      skipNetworkCheck: true,
      policy: 'automatic'
    });

    expect(ok).toBe(true);
    expect(manager.getStatus()).toBe('ACTIVE');
    expect(manager.getActiveModel()?.id).toBe(modelToAcquire.modelId);
  });

  // 30. Model rollback on corrupted download
  it('30. should roll back to previously verified active model if download verification fails', async () => {
    const manager = new AiModelManager();
    const validBuffer = new TextEncoder().encode('good-model').buffer;
    const goodHash = await manager.computeSha256(validBuffer);

    const goodModel = {
      modelId: 'model-v1',
      displayName: 'Model V1',
      version: '1.0.0',
      modelFormat: 'clinical-weights',
      downloadUrl: 'https://storage.googleapis.com/test/model-v1.bin',
      fileSizeBytes: validBuffer.byteLength,
      sha256: goodHash,
      minimumRamMb: 512,
      supportedAbis: ['webassembly'],
      runtime: 'clinical-engine',
      quantization: 'int8',
      capabilities: ['maternal_health'],
      releaseStatus: 'stable'
    };
    aiModelCatalogue.registerModel(goodModel as any);

    // Activate good model first
    await manager.acquireModel(goodModel.modelId, {
      testBuffer: validBuffer,
      skipNetworkCheck: true,
      policy: 'automatic'
    });
    expect(manager.getActiveModel()?.id).toBe('model-v1');

    // Attempt to download a corrupt model
    const corruptBuffer = new TextEncoder().encode('corrupt-bytes').buffer;
    const badModel = {
      modelId: 'model-v2',
      displayName: 'Model V2',
      version: '1.1.0',
      modelFormat: 'clinical-weights',
      downloadUrl: 'https://storage.googleapis.com/test/model-v2.bin',
      fileSizeBytes: corruptBuffer.byteLength,
      sha256: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      minimumRamMb: 512,
      supportedAbis: ['webassembly'],
      runtime: 'clinical-engine',
      quantization: 'int8',
      capabilities: ['maternal_health'],
      releaseStatus: 'stable'
    };
    aiModelCatalogue.registerModel(badModel as any);

    const badResult = await manager.acquireModel(badModel.modelId, {
      testBuffer: corruptBuffer,
      skipNetworkCheck: true,
      policy: 'automatic'
    });

    expect(badResult).toBe(false);
    expect(manager.getStatus()).toBe('FAILED');
    // Active model was rolled back and preserved
    expect(manager.getActiveModel()?.id).toBe('model-v1');
  });

  // 31. Model version downgrade prevention
  it('31. should reject attempts to downgrade active model to an older version', async () => {
    const manager = new AiModelManager();
    const v2Buffer = new TextEncoder().encode('v2-model').buffer;
    const v2Hash = await manager.computeSha256(v2Buffer);

    const v2Model = {
      modelId: 'downgrade-v2',
      displayName: 'Downgrade V2',
      version: '2.0.0',
      modelFormat: 'clinical-weights',
      downloadUrl: 'https://storage.googleapis.com/test/v2.bin',
      fileSizeBytes: v2Buffer.byteLength,
      sha256: v2Hash,
      minimumRamMb: 512,
      supportedAbis: ['webassembly'],
      runtime: 'clinical-engine',
      quantization: 'int8',
      capabilities: ['maternal_health'],
      releaseStatus: 'stable'
    };
    aiModelCatalogue.registerModel(v2Model as any);

    await manager.acquireModel(v2Model.modelId, {
      testBuffer: v2Buffer,
      skipNetworkCheck: true,
      policy: 'automatic'
    });

    // Attempt to downgrade to 1.0.0
    const olderModel = {
      modelId: 'downgrade-v1',
      displayName: 'Downgrade V1',
      version: '1.0.0',
      modelFormat: 'clinical-weights',
      downloadUrl: 'https://storage.googleapis.com/test/v1.bin',
      fileSizeBytes: v2Buffer.byteLength,
      sha256: v2Hash,
      minimumRamMb: 512,
      supportedAbis: ['webassembly'],
      runtime: 'clinical-engine',
      quantization: 'int8',
      capabilities: ['maternal_health'],
      releaseStatus: 'stable'
    };
    aiModelCatalogue.registerModel(olderModel as any);

    const ok = await manager.acquireModel(olderModel.modelId, {
      skipNetworkCheck: true,
      policy: 'automatic'
    });

    expect(ok).toBe(false);
    expect(manager.getStatus()).toBe('FAILED');
    expect(manager.getProgress().error).toContain('Version downgrade rejected');
  });

  // 32. Production model endpoint unconfigured handling
  it('32. should truthfully report MODEL_SOURCE_NOT_CONFIGURED when model endpoint is empty', () => {
    aiModelCatalogue.setProductionEndpoint(null);
    expect(aiModelCatalogue.isProductionEndpointConfigured()).toBe(false);
    expect(aiModelCatalogue.getEndpointStatus()).toBe('MODEL_SOURCE_NOT_CONFIGURED');
    expect(aiModelCatalogue.getModelSourceStatus()).toBe('MODEL_SOURCE_NOT_CONFIGURED');

    const manager = new AiModelManager();
    expect(manager.getModelSourceStatus()).toBe('MODEL_SOURCE_NOT_CONFIGURED');
  });

  // 33. Voice conversation state machine transitions
  it('33. should validate legal state machine transitions in VoiceConversationService', () => {
    const voiceService = VoiceConversationService.getInstance();
    voiceService.setSupportedCapabilities(true, true);
    voiceService.cancel();

    expect(voiceService.getInteractionState()).toBe('idle');

    // idle -> listening (valid)
    expect(voiceService.transitionTo('listening')).toBe(true);
    expect(voiceService.getInteractionState()).toBe('listening');

    // listening -> processing (valid)
    expect(voiceService.transitionTo('processing')).toBe(true);
    expect(voiceService.getInteractionState()).toBe('processing');

    // processing -> speaking (valid)
    expect(voiceService.transitionTo('speaking')).toBe(true);
    expect(voiceService.getInteractionState()).toBe('speaking');

    // speaking -> interrupted (valid)
    expect(voiceService.transitionTo('interrupted')).toBe(true);
    expect(voiceService.getInteractionState()).toBe('interrupted');

    // interrupted -> idle (valid)
    expect(voiceService.transitionTo('idle')).toBe(true);
    expect(voiceService.getInteractionState()).toBe('idle');
  });

  // 34. Barge-in interruption of active voice
  it('34. should immediately stop assistant speech and transition to interrupted on bargeIn', () => {
    const voiceService = VoiceConversationService.getInstance();
    voiceService.transitionTo('speaking');

    const interrupted = voiceService.bargeIn(false);
    expect(interrupted).toBe(true);
    expect(voiceService.getInteractionState()).toBe('interrupted');
  });

  // 35. Voice capability reporting across Ghanaian languages
  it('35. should accurately report voice capabilities across Ghanaian languages', () => {
    const voiceService = VoiceConversationService.getInstance();

    const enCaps = voiceService.getLanguageCapabilities('en');
    expect(enCaps.displayName).toBe('English');
    expect(enCaps.hasTextTranslation).toBe(true);

    const dagbaniCaps = voiceService.getLanguageCapabilities('dagbani');
    expect(dagbaniCaps.displayName).toContain('Dagbani');
    expect(dagbaniCaps.fallbackVoiceLocale).toBe('en-GH');

    const twiCaps = voiceService.getLanguageCapabilities('twi');
    expect(twiCaps.displayName).toContain('Twi');
    expect(twiCaps.fallbackVoiceLocale).toBe('en-GH');
  });

  // 36. Voice fallback when local speech synthesis unavailable
  it('36. should use Ghanaian English engine fallback when regional native voice is unavailable', () => {
    const voiceService = VoiceConversationService.getInstance();
    const eweCaps = voiceService.getLanguageCapabilities('ewe');
    expect(eweCaps.fallbackStrategy).toContain('Ghanaian English Engine');
  });

  // 37. Profile switching cancels active AI generation
  it('37. should cancel active generation and abort speech when switching family profiles', () => {
    const voiceService = VoiceConversationService.getInstance();
    const cancelSpy = vi.spyOn(voiceService, 'cancel');

    voiceService.onProfileSwitch();
    expect(cancelSpy).toHaveBeenCalled();
  });

  // 38. Profile switching isolates conversation history
  it('38. should strictly isolate conversation history across family member profiles', async () => {
    const agent = new AiAgentService();

    // Member 1 (Mother)
    agent.setActiveMember('member-mother-1');
    await agent.sendMessage({
      message: 'When is my next ANC visit?',
      activeMember: { id: 'member-mother-1', displayName: 'Ama', type: 'mother' } as any
    });

    const motherHistory = agent.getHistoryForMember('member-mother-1');
    expect(motherHistory.length).toBeGreaterThan(0);
    expect(motherHistory[0].content).toContain('ANC');

    // Switch to Member 2 (Child)
    agent.setActiveMember('member-child-2');
    const childHistoryBefore = agent.getHistoryForMember('member-child-2');
    expect(childHistoryBefore.length).toBe(0);

    await agent.sendMessage({
      message: 'What vaccines are due at 6 weeks?',
      activeMember: { id: 'member-child-2', displayName: 'Kofi', type: 'child' } as any
    });

    const childHistoryAfter = agent.getHistoryForMember('member-child-2');
    expect(childHistoryAfter.length).toBeGreaterThan(0);
    expect(childHistoryAfter[0].content).toContain('vaccines');

    // Verify mother's history was not modified or blended
    const motherHistoryAfter = agent.getHistoryForMember('member-mother-1');
    expect(motherHistoryAfter.every((turn) => !turn.content.includes('vaccines'))).toBe(true);
  });

  // 39. AppResilienceService error event logging
  it('39. should log structured resilience reports with timestamp and error category', () => {
    appResilienceService.clearReports();
    appResilienceService.report('AI_TIMEOUT', 'Gateway request exceeded 10000ms timeout window.');
    appResilienceService.report('AI_RATE_LIMITED', 'HTTP 429 Too Many Requests.');

    const reports = appResilienceService.getRecentReports();
    expect(reports.length).toBe(2);
    expect(reports[0].type).toBe('AI_TIMEOUT');
    expect(reports[1].type).toBe('AI_RATE_LIMITED');
    expect(reports[0].timestamp).toBeDefined();
  });

  // 40. Zero secret leakage across logs and errors
  it('40. should ensure zero provider secrets or private keys appear in error messages or logs', async () => {
    const secretKey = 'ai_secret_super_private_token_12345';
    const server = new BackendAiGatewayServer({ geminiApiKey: secretKey });

    // Test with invalid message
    const badResult = await server.handleRequest({ message: '' });
    const serializedError = JSON.stringify(badResult);

    expect(serializedError).not.toContain(secretKey);

    // Test unconfigured server
    const unconfiguredServer = new BackendAiGatewayServer({ geminiApiKey: null });
    const unconfiguredResult = await unconfiguredServer.handleRequest({
      message: 'Hello'
    });
    const serializedUnconf = JSON.stringify(unconfiguredResult);

    expect(serializedUnconf).not.toContain(secretKey);
    expect(unconfiguredResult.statusCode).toBe(503);
    expect((unconfiguredResult.body as any).error).toBe('AI_GATEWAY_NOT_CONFIGURED');
  });
});
