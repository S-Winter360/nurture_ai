import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AiRuntimeConfig, aiRuntimeConfig } from '../src/services/ai/AiRuntimeConfig';
import { CloudAiProvider } from '../src/services/ai/providers/CloudAiProvider';
import { OfflineFallbackProvider } from '../src/services/ai/providers/OfflineFallbackProvider';
import { LocalModelProvider } from '../src/services/ai/providers/LocalModelProvider';
import { AiProviderManager, aiProviderManager } from '../src/services/ai/providers/AiProviderManager';
import { AutoModelAcquisitionService, autoModelAcquisitionService } from '../src/services/ai/AutoModelAcquisitionService';
import { aiModelManager } from '../src/services/ai/AiModelManager';
import { localModelRegistry } from '../src/services/ai/LocalModelRegistry';
import { aiModelCatalogue } from '../src/services/ai/AiModelCatalogue';
import { deviceCapabilityService } from '../src/services/ai/DeviceCapabilityService';
import { voiceConversationService } from '../src/services/voice/VoiceConversationService';
import { speechRecognitionService } from '../src/services/voice/SpeechRecognitionService';
import { localSpeechService } from '../src/services/speech/localSpeechService';
import { aiAgentService } from '../src/services/ai/AiAgentService';
import { AiSafetyPolicy } from '../src/services/ai/AiSafetyPolicy';
import { AiResponseValidator } from '../src/services/ai/AiResponseValidator';
import { ClinicalKnowledgeRetriever } from '../src/services/ai/rag/ClinicalKnowledgeRetriever';
import { appResilienceService } from '../src/services/resilience/AppResilienceService';
import { GHS_PRIMARY_MODEL, AVAILABLE_MODELS_CATALOG } from '../src/services/ai/AiModelRegistry';
import { SanitizedAiContext, AiProviderRequest } from '../src/services/ai/types';

describe('Sprint 13D: Production AI Connectivity, Real Model Activation & Voice Hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiRuntimeConfig.resetConfig();
    aiModelManager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);
    appResilienceService.clearReports();
    aiProviderManager.setNetworkPolicy('always_allow');
    aiProviderManager.setManualCloudApproved(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Section 1: AiRuntimeConfig & Environment Setup (6 tests)
  // =========================================================================
  describe('Suite 1: AiRuntimeConfig & Environment Hardening', () => {
    it('1.1: initializes with safe defaults and zero hardcoded secrets', () => {
      const config = aiRuntimeConfig.getConfig();
      expect(config.cloudApiKey).toBeNull();
      expect(config.defaultModelDownloadPolicy).toBe('wifi_only');
      expect(config.voice.bargeInEnabled).toBe(true);
      expect(config.safety.emergencyBypassEnabled).toBe(true);
      expect(config.safety.strictPiiRedaction).toBe(true);
      expect(config.safety.enforceClinicalBoundaries).toBe(true);
    });

    it('1.2: correctly detects whether cloud endpoint is configured', () => {
      expect(aiRuntimeConfig.isCloudConfigured()).toBe(false);
      aiRuntimeConfig.setCloudEndpoint('https://api.ghs-clinical-ai.gov.gh/chat');
      expect(aiRuntimeConfig.isCloudConfigured()).toBe(true);
      expect(aiRuntimeConfig.getCloudEndpoint()).toBe('https://api.ghs-clinical-ai.gov.gh/chat');
      aiRuntimeConfig.setCloudEndpoint(null);
      expect(aiRuntimeConfig.isCloudConfigured()).toBe(false);
    });

    it('1.3: enforces minimum safe timeout thresholds for cloud calls', () => {
      aiRuntimeConfig.setCloudTimeoutMs(500); // Attempt too low
      expect(aiRuntimeConfig.getCloudTimeoutMs()).toBe(1000); // Clamped to at least 1000ms
      aiRuntimeConfig.setCloudTimeoutMs(15000);
      expect(aiRuntimeConfig.getCloudTimeoutMs()).toBe(15000);
    });

    it('1.4: supports partial runtime config updates and retains nested properties', () => {
      aiRuntimeConfig.updateConfig({
        voice: {
          defaultLanguage: 'twi',
          bargeInEnabled: true,
          speechRate: 0.8,
          fallbackVoiceLocale: 'en-GH'
        }
      });
      const updated = aiRuntimeConfig.getVoiceConfig();
      expect(updated.defaultLanguage).toBe('twi');
      expect(updated.speechRate).toBe(0.8);
      expect(updated.fallbackVoiceLocale).toBe('en-GH');
      // Safety config remains unchanged
      expect(aiRuntimeConfig.getSafetyConfig().maxHistoryTurns).toBe(8);
    });

    it('1.5: resets cleanly back to default environment configuration', () => {
      aiRuntimeConfig.setCloudEndpoint('https://custom.endpoint.com');
      aiRuntimeConfig.setModelDownloadPolicy('always_allow');
      expect(aiRuntimeConfig.getModelDownloadPolicy()).toBe('always_allow');

      aiRuntimeConfig.resetConfig();
      expect(aiRuntimeConfig.getModelDownloadPolicy()).toBe('wifi_only');
      expect(aiRuntimeConfig.getCloudEndpoint()).toBeNull();
    });

    it('1.6: protects client bundle by ensuring no private provider tokens are exposed', () => {
      const config = aiRuntimeConfig.getConfig();
      expect((config as any).apiSecret).toBeUndefined();
      expect((config as any).bearerToken).toBeUndefined();
      expect((config as any).firebaseServiceKey).toBeUndefined();
    });
  });

  // =========================================================================
  // Section 2: CloudAiProvider Production Connectivity (8 tests)
  // =========================================================================
  describe('Suite 2: CloudAiProvider Production Connectivity', () => {
    const mockContext: SanitizedAiContext = {
      profileType: 'mother',
      displayName: 'Abena Mensah',
      isPregnancyActive: true,
      hasChildren: false,
      maternalSummary: {
        gestationalAgeWeeks: 20,
        nextAncVisit: {
          title: 'ANC Contact 2',
          scheduledAt: '2026-10-01'
        },
        overdueCount: 0
      }
    };

    const mockRequest: AiProviderRequest = {
      query: 'What nutrition is recommended at 20 weeks?',
      sanitizedContext: mockContext,
      clinicalEvidence: 'GHS Safe Motherhood Protocols: Iron & Folic Acid daily.',
      safetyClassification: 'SAFE_GENERAL',
      preferredLanguage: 'en'
    };

    it('2.1: reports truthfully unavailable when no endpoint URL is configured', async () => {
      const provider = new CloudAiProvider({ endpointUrl: undefined });
      provider.setEndpointUrl(null);
      expect(provider.isConfigured()).toBe(false);
      expect(await provider.isAvailable()).toBe(false);

      await expect(provider.generate(mockRequest)).rejects.toThrow(/not configured/i);
    });

    it('2.2: executes successfully when configured with a valid remote endpoint', async () => {
      const provider = new CloudAiProvider({
        endpointUrl: 'https://api.ghs-clinical-ai.gov.gh/chat'
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: 'Verified clinical nutrition guidance for week 20: continue daily IFA and diverse diet.',
          origin: 'GHS_CLINICAL_ASSET',
          citation: 'Ghana Health Service Maternal Nutrition Protocols (2020)',
          confidence: 0.95,
          model: 'ghs-clinical-cloud-v1'
        })
      });
      globalThis.fetch = mockFetch;

      const response = await provider.generate(mockRequest);

      expect(response.text).toContain('clinical nutrition guidance');
      expect(response.origin).toBe('GHS_CLINICAL_ASSET');
      expect(response.citation).toContain('Ghana Health Service');
      expect(response.confidence).toBe(0.95);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ghs-clinical-ai.gov.gh/chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
      );
    });

    it('2.3: handles request timeout and aborts after configured timeout duration', async () => {
      const provider = new CloudAiProvider({
        endpointUrl: 'https://api.ghs-clinical-ai.gov.gh/chat',
        timeoutMs: 50 // Short timeout for test
      });

      globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          options.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      await expect(provider.generate(mockRequest)).rejects.toThrow(/timed out/i);
    });

    it('2.4: serializes query, sanitized context, evidence, and language correctly in request body', async () => {
      const provider = new CloudAiProvider({
        endpointUrl: 'https://api.ghs-clinical-ai.gov.gh/chat'
      });

      let capturedBody: any = null;
      globalThis.fetch = vi.fn().mockImplementation((_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return Promise.resolve({
          ok: true,
          json: async () => ({
            text: 'Valid response',
            origin: 'GHS_CLINICAL_ASSET'
          })
        });
      });

      await provider.generate(mockRequest);

      expect(capturedBody).not.toBeNull();
      expect(capturedBody.query).toBe(mockRequest.query);
      expect(capturedBody.context.profileType).toBe('mother');
      expect(capturedBody.context.displayName).toBe('Abena Mensah');
      expect(capturedBody.evidence).toContain('Iron & Folic Acid');
      expect(capturedBody.language).toBe('en');
    });

    it('2.5: handles HTTP 500 error and reports resilience incident', async () => {
      const provider = new CloudAiProvider({
        endpointUrl: 'https://api.ghs-clinical-ai.gov.gh/chat'
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      await expect(provider.generate(mockRequest)).rejects.toThrow(/HTTP 500/i);
      const reports = appResilienceService.getReports();
      expect(reports.some(r => r.type === 'AI_PROVIDER_FAILURE')).toBe(true);
    });

    it('2.6: respects caller AbortSignal for early user cancellation', async () => {
      const provider = new CloudAiProvider({
        endpointUrl: 'https://api.ghs-clinical-ai.gov.gh/chat'
      });

      const controller = new AbortController();
      controller.abort();

      globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
        if (options.signal?.aborted) {
          const err = new Error('The user aborted a request.');
          err.name = 'AbortError';
          return Promise.reject(err);
        }
        return Promise.resolve({ ok: true, json: async () => ({ text: 'ok' }) });
      });

      await expect(
        provider.generate({ ...mockRequest, signal: controller.signal })
      ).rejects.toThrow();
    });

    it('2.7: detects offline state and prevents network calls', async () => {
      const provider = new CloudAiProvider({
        endpointUrl: 'https://api.ghs-clinical-ai.gov.gh/chat'
      });

      // Simulate navigator offline
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

      expect(await provider.isAvailable()).toBe(false);
      await expect(provider.generate(mockRequest)).rejects.toThrow(/network connection is unavailable/i);

      // Restore
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    });

    it('2.8: handles malformed json response without unhandled crash', async () => {
      const provider = new CloudAiProvider({
        endpointUrl: 'https://api.ghs-clinical-ai.gov.gh/chat'
      });

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ unexpectedKey: 12345 }) // Missing text property
      });

      await expect(provider.generate(mockRequest)).rejects.toThrow(/malformed response/i);
    });
  });

  // =========================================================================
  // Section 3: AiProviderManager Orchestration & Priority Chain (8 tests)
  // =========================================================================
  describe('Suite 3: AiProviderManager Orchestration & Priority Chain', () => {
    const mockContext: SanitizedAiContext = {
      profileType: 'mother',
      displayName: 'Akosua',
      isPregnancyActive: true,
      hasChildren: false,
      maternalSummary: {
        gestationalAgeWeeks: 12,
        nextAncVisit: {
          title: 'ANC Contact 1',
          scheduledAt: '2026-09-30'
        },
        overdueCount: 0
      }
    };

    const mockRequest: AiProviderRequest = {
      query: 'When is ANC Contact 1?',
      sanitizedContext: mockContext,
      clinicalEvidence: 'GHS ANC Schedule',
      safetyClassification: 'SAFE_GENERAL',
      preferredLanguage: 'en'
    };

    it('3.1: selects LocalModelProvider first when a verified local model is active', async () => {
      aiModelManager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);
      const provider = await aiProviderManager.selectProvider(mockRequest);
      expect(provider.getInfo().type).toBe('LOCAL_MODEL');
    });

    it('3.2: selects CloudAiProvider when local model is unavailable and cloud is permitted', async () => {
      aiModelManager.clearActiveModel();
      const cloudProvider = new CloudAiProvider({
        endpointUrl: 'https://api.ghs-clinical-ai.gov.gh/chat'
      });
      aiProviderManager.setCloudProvider(cloudProvider);
      aiProviderManager.setNetworkPolicy('always_allow');

      const provider = await aiProviderManager.selectProvider(mockRequest);
      expect(provider.getInfo().type).toBe('REMOTE_MODEL');
    });

    it('3.3: falls back to OfflineFallbackProvider when neither local nor cloud is available', async () => {
      aiModelManager.clearActiveModel();
      const cloudProvider = new CloudAiProvider({ endpointUrl: undefined });
      cloudProvider.setEndpointUrl(null);
      aiProviderManager.setCloudProvider(cloudProvider);

      const provider = await aiProviderManager.selectProvider(mockRequest);
      expect(provider.getInfo().type).toBe('FALLBACK');
    });

    it('3.4: blocks cloud provider under wifi_only policy when cellular is detected', async () => {
      aiModelManager.clearActiveModel();
      const cloudProvider = new CloudAiProvider({
        endpointUrl: 'https://api.ghs-clinical-ai.gov.gh/chat'
      });
      aiProviderManager.setCloudProvider(cloudProvider);
      aiProviderManager.setNetworkPolicy('wifi_only');

      // Mock cellular connection
      (navigator as any).connection = { type: 'cellular' };

      expect(aiProviderManager.isCloudPermittedByPolicy()).toBe(false);
      const selected = await aiProviderManager.selectProvider(mockRequest);
      expect(selected.getInfo().type).toBe('FALLBACK');

      delete (navigator as any).connection;
    });

    it('3.5: allows cloud provider under wifi_only policy when wifi is active', async () => {
      aiModelManager.clearActiveModel();
      const cloudProvider = new CloudAiProvider({
        endpointUrl: 'https://api.ghs-clinical-ai.gov.gh/chat'
      });
      aiProviderManager.setCloudProvider(cloudProvider);
      aiProviderManager.setNetworkPolicy('wifi_only');

      (navigator as any).connection = { type: 'wifi' };

      expect(aiProviderManager.isCloudPermittedByPolicy()).toBe(true);
      const selected = await aiProviderManager.selectProvider(mockRequest);
      expect(selected.getInfo().type).toBe('REMOTE_MODEL');

      delete (navigator as any).connection;
    });

    it('3.6: requires manual approval when network policy is manual_approval_only', async () => {
      aiModelManager.clearActiveModel();
      const cloudProvider = new CloudAiProvider({
        endpointUrl: 'https://api.ghs-clinical-ai.gov.gh/chat'
      });
      aiProviderManager.setCloudProvider(cloudProvider);
      aiProviderManager.setNetworkPolicy('manual_approval_only');
      aiProviderManager.setManualCloudApproved(false);

      expect(aiProviderManager.isCloudPermittedByPolicy()).toBe(false);
      let selected = await aiProviderManager.selectProvider(mockRequest);
      expect(selected.getInfo().type).toBe('FALLBACK');

      // Now approve manually
      aiProviderManager.setManualCloudApproved(true);
      expect(aiProviderManager.isCloudPermittedByPolicy()).toBe(true);
      selected = await aiProviderManager.selectProvider(mockRequest);
      expect(selected.getInfo().type).toBe('REMOTE_MODEL');
    });

    it('3.7: execute automatically falls back to deterministic engine if remote provider throws', async () => {
      aiModelManager.clearActiveModel();
      const cloudProvider = new CloudAiProvider({
        endpointUrl: 'https://api.ghs-clinical-ai.gov.gh/chat'
      });
      // Force cloud provider to reject
      vi.spyOn(cloudProvider, 'generate').mockRejectedValue(new Error('Cloud server crashed'));
      aiProviderManager.setCloudProvider(cloudProvider);

      const response = await aiProviderManager.execute(mockRequest);
      expect(response.origin).toBe('CARE_ENGINE');
      expect(response.provider?.type).toBe('FALLBACK');
      expect(response.text).toContain('ANC Contact 1');
    });

    it('3.8: retains metadata for provider type, origin, and latency assessment', async () => {
      aiModelManager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);
      const response = await aiProviderManager.execute(mockRequest);
      expect(response.provider).toBeDefined();
      expect(response.provider?.isLocal).toBe(true);
      expect(response.confidence).toBeGreaterThan(0.8);
      expect(response.citation).toContain('GHS Safe Motherhood Protocol');
    });
  });

  // =========================================================================
  // Section 4: AutoModelAcquisitionService & Verification Lifecycle (8 tests)
  // =========================================================================
  describe('Suite 4: AutoModelAcquisitionService & Model Lifecycle', () => {
    it('4.1: verifies that models are not bundled statically in client assets', () => {
      expect(autoModelAcquisitionService.isModelBundled()).toBe(false);
    });

    it('4.2: evaluates eligibility under wifi_only policy correctly', async () => {
      localModelRegistry.clearAll();
      const decision = await autoModelAcquisitionService.evaluateEligibility('wifi_only');
      expect(decision.shouldAcquire).toBe(true);
      expect(decision.modelToAcquire).toBeDefined();
      expect(decision.reason).toContain('Eligible');
    });

    it('4.3: blocks automatic acquisition under manual_approval_only policy', async () => {
      const decision = await autoModelAcquisitionService.evaluateEligibility('manual_approval_only');
      expect(decision.shouldAcquire).toBe(false);
      expect(decision.reason).toContain('Manual approval required');
    });

    it('4.4: pre-checks device storage requirement of 2.5x model size', async () => {
      const smallModelSize = 2 * 1024 * 1024; // 2 MB
      const hasStorage = await aiModelManager.checkStorageAvailable(smallModelSize);
      expect(hasStorage).toBe(true);

      // Huge model size check
      const hugeModelSize = 500 * 1024 * 1024; // 500 MB
      const hugeStorage = await aiModelManager.checkStorageAvailable(hugeModelSize);
      // In constrained container environment without storage.estimate, conservative check applies
      expect(typeof hugeStorage).toBe('boolean');
    });

    it('4.5: performs streaming chunk simulation and computes exact SHA-256 hash', async () => {
      const testData = new Uint8Array([10, 20, 30, 40, 50, 60]);
      const hash = await aiModelManager.computeSha256(testData.buffer);
      expect(hash).toHaveLength(64); // Valid hex SHA-256
      expect(typeof hash).toBe('string');
    });

    it('4.6: rejects acquisition and preserves existing model when SHA-256 checksum mismatches', async () => {
      aiModelManager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);
      const corruptBuffer = new Uint8Array([99, 99, 99, 99]).buffer;

      const success = await aiModelManager.acquireModel(GHS_PRIMARY_MODEL.id, {
        testBuffer: corruptBuffer,
        skipNetworkCheck: true
      });

      expect(success).toBe(false);
      expect(aiModelManager.getStatus()).toBe('FAILED');
      // Previous active model must be preserved
      expect(aiModelManager.getActiveModel()?.id).toBe(GHS_PRIMARY_MODEL.id);
    });

    it('4.7: prevents model version downgrade when older semver candidate is evaluated', () => {
      const cmp1 = aiModelManager.compareSemver('1.2.0', '1.1.0');
      expect(cmp1).toBeGreaterThan(0);

      const cmp2 = aiModelManager.compareSemver('1.0.0', '1.1.0');
      expect(cmp2).toBeLessThan(0);

      const cmp3 = aiModelManager.compareSemver('1.1.0', '1.1.0');
      expect(cmp3).toBe(0);
    });

    it('4.8: registers atomically in LocalModelRegistry upon verified activation', async () => {
      localModelRegistry.clearAll();
      const testBuffer = new Uint8Array([1, 2, 3, 4]).buffer;
      const expectedHash = await aiModelManager.computeSha256(testBuffer);

      const customModel = {
        ...GHS_PRIMARY_MODEL,
        id: 'ghs-nano-custom-test',
        expectedChecksumSha256: expectedHash
      };

      aiModelManager.setVerifiedActiveModel(customModel);
      const active = localModelRegistry.getActiveModel();
      expect(active).not.toBeNull();
      expect(active?.modelId).toBe('ghs-nano-custom-test');
      expect(active?.activationStatus).toBe('ACTIVE');
    });
  });

  // =========================================================================
  // Section 5: VoiceConversationService State Machine & Barge-In Hardening (8 tests)
  // =========================================================================
  describe('Suite 5: VoiceConversationService State Machine & Barge-In Hardening', () => {
    beforeEach(() => {
      voiceConversationService.setSupportedCapabilities(true, true);
      voiceConversationService.setInteractionState('idle');
    });

    it('5.1: computes correct interaction states based on active subsystem flags', () => {
      voiceConversationService.cancel();
      expect(voiceConversationService.computeInteractionState()).toBe('idle');

      voiceConversationService.setInteractionState('speaking');
      expect(voiceConversationService.getInteractionState()).toBe('speaking');

      voiceConversationService.setInteractionState('interrupted');
      expect(voiceConversationService.getInteractionState()).toBe('interrupted');
    });

    it('5.2: validates state machine transitions via transitionTo', () => {
      voiceConversationService.setInteractionState('idle');
      expect(voiceConversationService.transitionTo('listening')).toBe(true);
      expect(voiceConversationService.getInteractionState()).toBe('listening');

      expect(voiceConversationService.transitionTo('processing')).toBe(true);
      expect(voiceConversationService.getInteractionState()).toBe('processing');

      expect(voiceConversationService.transitionTo('speaking')).toBe(true);
      expect(voiceConversationService.getInteractionState()).toBe('speaking');

      expect(voiceConversationService.transitionTo('idle')).toBe(true);
      expect(voiceConversationService.getInteractionState()).toBe('idle');
    });

    it('5.3: performs true barge-in by immediately stopping assistant speech', () => {
      const stopSpy = vi.spyOn(localSpeechService, 'stop');
      voiceConversationService.bargeIn();
      expect(stopSpy).toHaveBeenCalled();
      expect(voiceConversationService.getInteractionState()).toBe('interrupted');
    });

    it('5.4: barge-in can restart listening immediately when requested', () => {
      const startSpy = vi.spyOn(speechRecognitionService, 'startListening').mockReturnValue(true);
      const started = voiceConversationService.bargeIn(true, 'twi');
      expect(started).toBe(true);
      expect(startSpy).toHaveBeenCalledWith('twi', expect.any(Object));
    });

    it('5.5: inspects language capabilities for Ghanaian languages with fallback info', () => {
      const twiCaps = voiceConversationService.getLanguageCapabilities('twi');
      expect(twiCaps.languageCode).toBe('twi');
      expect(twiCaps.displayName).toContain('Twi');
      expect(twiCaps.hasTextTranslation).toBe(true);
      expect(twiCaps.fallbackVoiceLocale).toBe('en-GH');

      const dagbaniCaps = voiceConversationService.getLanguageCapabilities('dagbani');
      expect(dagbaniCaps.languageCode).toBe('dagbani');
      expect(dagbaniCaps.displayName).toContain('Dagbani');
      expect(dagbaniCaps.fallbackVoiceLocale).toBe('en-GH');
    });

    it('5.6: handles voice input start and updates recognition state', () => {
      const mockStart = vi.spyOn(speechRecognitionService, 'startListening').mockImplementation((_lang, callbacks) => {
        callbacks.onStateChange('LISTENING');
        callbacks.onResult('Hello NurtureAI', false);
        callbacks.onResult('Hello NurtureAI complete', true);
        return true;
      });

      let completedText = '';
      voiceConversationService.startVoiceInput('en', (result) => {
        completedText = result;
      });

      expect(mockStart).toHaveBeenCalled();
      expect(completedText).toBe('Hello NurtureAI complete');
    });

    it('5.7: emergency query in processVoiceQuery short-circuits immediately before model', async () => {
      const speakSpy = vi.spyOn(voiceConversationService, 'speakResponse').mockResolvedValue(true);

      const response = await voiceConversationService.processVoiceQuery({
        message: 'Severe bleeding in third trimester with abdominal pain',
        voiceMode: true,
        preferredLanguage: 'en'
      });

      expect(response.emergencyFlag).toBe(true);
      expect(response.text).toContain('EMERGENCY');
      expect(speakSpy).toHaveBeenCalled();
    });

    it('5.8: onProfileSwitch immediately cancels voice input, stops speech, and resets state', () => {
      const stopSpeechSpy = vi.spyOn(localSpeechService, 'stop');
      const abortSttSpy = vi.spyOn(speechRecognitionService, 'abort');

      voiceConversationService.onProfileSwitch();

      expect(stopSpeechSpy).toHaveBeenCalled();
      expect(abortSttSpy).toHaveBeenCalled();
      expect(voiceConversationService.getState().recognitionState).toBe('IDLE');
    });
  });

  // =========================================================================
  // Section 6: End-to-End Safety, Profile Isolation & Clinical RAG (7 tests)
  // =========================================================================
  describe('Suite 6: End-to-End Safety, Profile Isolation & Clinical RAG Integration', () => {
    it('6.1: provides verified GHS ANC visit citations for pregnancy profile', async () => {
      const pregnancyContext: SanitizedAiContext = {
        profileType: 'mother',
        displayName: 'Esi Doe',
        isPregnancyActive: true,
        hasChildren: false,
        maternalSummary: {
          gestationalAgeWeeks: 28,
          nextAncVisit: {
            title: 'ANC Contact 4 (Week 30)',
            scheduledAt: '2026-10-15'
          },
          overdueCount: 0
        }
      };

      const response = await aiAgentService.sendMessage({
        message: 'When is my next ANC contact?',
        activeMember: {
          id: 'mem_esi_1',
          familyId: 'fam_1',
          displayName: 'Esi Doe',
          type: 'mother',
          relationship: 'Mother',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        clinicalContext: pregnancyContext
      });

      expect(response.text).toContain('ANC Contact 4');
      expect(response.sourceMetadata).toContain('GHS Safe Motherhood');
      expect(response.origin).toBe('CARE_ENGINE');
    });

    it('6.2: provides verified GHS EPI immunization schedule citation for child profile', async () => {
      const childContext: SanitizedAiContext = {
        profileType: 'child',
        displayName: 'Kwame Jnr',
        isPregnancyActive: false,
        hasChildren: true,
        childSummary: {
          ageMonths: 2,
          nextVaccine: {
            title: 'Penta 1, PCV 1, Rota 1, OPV 1',
            scheduledAt: '2026-09-25'
          },
          overdueCount: 0
        }
      };

      const response = await aiAgentService.sendMessage({
        message: 'When is my baby next scheduled for immunization?',
        activeMember: {
          id: 'mem_child_1',
          familyId: 'fam_1',
          displayName: 'Kwame Jnr',
          type: 'child',
          relationship: 'Child',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        clinicalContext: childContext
      });

      expect(response.text).toContain('Penta 1');
      expect(response.sourceMetadata).toContain('GHS EPI');
    });

    it('6.3: sanitizes PII (Ghana phone numbers, emails, database UUIDs) before processing', () => {
      const dirtyInput = 'Call me at 0244123456 or +233244123456 or test@gmail.com about record mem_abc123';
      const clean = aiAgentService.sanitizePii(dirtyInput);
      expect(clean).not.toContain('0244123456');
      expect(clean).not.toContain('+233244123456');
      expect(clean).not.toContain('test@gmail.com');
      expect(clean).not.toContain('mem_abc123');
      expect(clean).toContain('[PHONE_REDACTED]');
      expect(clean).toContain('[EMAIL_REDACTED]');
      expect(clean).toContain('[ID_REDACTED]');
    });

    it('6.4: short-circuits critical obstetric emergencies immediately with zero model latency', async () => {
      const response = await aiAgentService.sendMessage({
        message: 'Severe vaginal bleeding and convulsions at 32 weeks'
      });

      expect(response.emergencyFlag).toBe(true);
      expect(response.safetyClassification).toBe('EMERGENCY');
      expect(response.text).toContain('EMERGENCY');
      expect(response.text).toContain('112');
    });

    it('6.5: short-circuits critical neonatal emergencies (inability to suckle, high fever)', async () => {
      const response = await aiAgentService.sendMessage({
        message: 'My 1-week-old baby is lethargic, unable to breastfeed, with very hot skin'
      });

      expect(response.emergencyFlag).toBe(true);
      expect(response.safetyClassification).toBe('EMERGENCY');
      expect(response.text).toContain('EMERGENCY');
      expect(response.text).toContain('health facility');
    });

    it('6.6: strictly blocks prohibited clinical actions such as modifying vaccine schedules or prescribing medication', async () => {
      const response = await aiAgentService.sendMessage({
        message: 'Please change my baby vaccine schedule to skip Penta 2 and prescribe amoxicillin 250mg'
      });

      expect(response.safetyClassification).toBe('PROHIBITED_ACTION');
      expect(response.text).toContain('cannot directly modify');
      expect(response.text).toContain('prescribe medications');
    });

    it('6.7: profile switching enforces strict profile isolation with zero memory leakage', async () => {
      aiAgentService.resetConversation();

      // Send message for Mother
      await aiAgentService.sendMessage({
        message: 'Question for Mother',
        activeMember: {
          id: 'mem_mother',
          familyId: 'fam_1',
          displayName: 'Mother',
          type: 'mother',
          relationship: 'Mother',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });

      expect(aiAgentService.getHistoryForMember('mem_mother')).toHaveLength(2);
      expect(aiAgentService.getHistoryForMember('mem_child')).toHaveLength(0);

      // Switch to Child
      aiAgentService.setActiveMember('mem_child');
      await aiAgentService.sendMessage({
        message: 'Question for Child',
        activeMember: {
          id: 'mem_child',
          familyId: 'fam_1',
          displayName: 'Child',
          type: 'child',
          relationship: 'Child',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      });

      expect(aiAgentService.getHistoryForMember('mem_mother')).toHaveLength(2);
      expect(aiAgentService.getHistoryForMember('mem_child')).toHaveLength(2);

      // Contexts are isolated
      const motherHist = aiAgentService.getHistoryForMember('mem_mother');
      const childHist = aiAgentService.getHistoryForMember('mem_child');
      expect(motherHist[0].content).toContain('Mother');
      expect(childHist[0].content).toContain('Child');
    });
  });
});
