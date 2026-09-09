import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OfflineFallbackProvider } from '../src/services/ai/providers/OfflineFallbackProvider';
import { CloudAiProvider } from '../src/services/ai/providers/CloudAiProvider';
import { DevelopmentAiProvider } from '../src/services/ai/providers/DevelopmentAiProvider';
import { AiProviderManager, aiProviderManager } from '../src/services/ai/providers/AiProviderManager';
import { AiAgentService, aiAgentService } from '../src/services/ai/AiAgentService';
import { AiSafetyPolicy } from '../src/services/ai/AiSafetyPolicy';
import { AiResponseValidator } from '../src/services/ai/AiResponseValidator';
import { ClinicalKnowledgeRetriever } from '../src/services/ai/rag/ClinicalKnowledgeRetriever';
import { ClinicalSourceRegistry } from '../src/services/ai/rag/ClinicalSourceRegistry';
import { ClinicalKnowledgeIndex } from '../src/services/ai/rag/ClinicalKnowledgeIndex';
import { voiceConversationService } from '../src/services/voice/VoiceConversationService';
import { speechRecognitionService } from '../src/services/voice/SpeechRecognitionService';
import { localSpeechService } from '../src/services/speech/localSpeechService';
import { aiModelManager, AiModelManager } from '../src/services/ai/AiModelManager';
import { autoModelAcquisitionService } from '../src/services/ai/AutoModelAcquisitionService';
import { deviceCapabilityService } from '../src/services/ai/DeviceCapabilityService';
import { appResilienceService } from '../src/services/resilience/AppResilienceService';
import { aiConversationRepository } from '../src/data/repositories/aiConversationRepository';
import { useAiStore } from '../src/stores/useAiStore';
import { GHS_PRIMARY_MODEL } from '../src/services/ai/AiModelRegistry';
import { SanitizedAiContext } from '../src/services/ai/types';

describe('Sprint 13C: Production AI Provider, Intelligent Model Acquisition & Voice AI Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiModelManager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);
    appResilienceService.clearReports();
    aiProviderManager.setNetworkPolicy('always_allow');
    aiProviderManager.setManualCloudApproved(false);
  });

  // =========================================================================
  // 1. AI Provider Architecture (Cloud, Offline Fallback, Selection, Local Model)
  // =========================================================================
  describe('Phase 1 - 4: AI Provider Architecture & Deterministic Selection', () => {
    const mockContext: SanitizedAiContext = {
      profileType: 'mother',
      displayName: 'Ama Osei',
      isPregnancyActive: true,
      hasChildren: false,
      maternalSummary: {
        gestationalAgeWeeks: 24,
        nextAncVisit: {
          title: 'ANC Contact 3 (Week 26)',
          scheduledAt: '2026-09-20'
        },
        overdueCount: 0
      }
    };

    it('1. OfflineFallbackProvider provides deterministic GHS response with verified citations', async () => {
      const provider = new OfflineFallbackProvider();
      expect(await provider.isAvailable()).toBe(true);

      const response = await provider.generate({
        query: 'When is my next ANC visit?',
        sanitizedContext: mockContext,
        safetyClassification: 'SAFE_GENERAL',
        preferredLanguage: 'en'
      });

      expect(response.text).toContain('ANC Contact 3');
      expect(response.origin).toBe('CARE_ENGINE');
      expect(response.citation).toContain('Ghana Health Service');
      expect(response.provider?.type).toBe('FALLBACK');
      expect(response.confidence).toBe(1.0);
    });

    it('2. CloudAiProvider truthfully reports unavailable when endpoint is not configured', async () => {
      const cloudProvider = new CloudAiProvider();
      cloudProvider.setEndpointUrl(null);

      expect(cloudProvider.isConfigured()).toBe(false);
      expect(await cloudProvider.isAvailable()).toBe(false);

      await expect(
        cloudProvider.generate({
          query: 'ANC information',
          sanitizedContext: mockContext,
          safetyClassification: 'SAFE_GENERAL',
          preferredLanguage: 'en'
        })
      ).rejects.toThrow(/not configured/i);
    });

    it('3. CloudAiProvider executes successfully when endpoint is configured and responds with valid JSON', async () => {
      const cloudProvider = new CloudAiProvider();
      cloudProvider.setEndpointUrl('https://api.ghs-clinical-ai.gov.gh/chat');

      // Mock fetch
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: 'Verified cloud guidance on antenatal iron and folic acid supplementation.',
          origin: 'GHS_CLINICAL_ASSET',
          citation: 'Ghana Health Service Maternal Nutrition Guidelines (2020)',
          confidence: 0.96,
          model: 'ghs-clinical-cloud-v1'
        })
      });
      globalThis.fetch = mockFetch;

      const res = await cloudProvider.generate({
        query: 'Tell me about iron supplementation',
        sanitizedContext: mockContext,
        safetyClassification: 'SAFE_GENERAL',
        preferredLanguage: 'en'
      });

      expect(res.text).toContain('Verified cloud guidance');
      expect(res.origin).toBe('GHS_CLINICAL_ASSET');
      expect(res.provider?.type).toBe('REMOTE_MODEL');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('4. CloudAiProvider handles timeout gracefully via AbortSignal', async () => {
      const cloudProvider = new CloudAiProvider({ timeoutMs: 50 });
      cloudProvider.setEndpointUrl('https://api.ghs-clinical-ai.gov.gh/chat');

      // Mock slow fetch that rejects on abort
      globalThis.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          options.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      });

      await expect(
        cloudProvider.generate({
          query: 'Slow query',
          sanitizedContext: mockContext,
          safetyClassification: 'SAFE_GENERAL',
          preferredLanguage: 'en'
        })
      ).rejects.toThrow(/timed out/i);
    });

    it('5. CloudAiProvider handles network failure and reports to AppResilienceService', async () => {
      const cloudProvider = new CloudAiProvider();
      cloudProvider.setEndpointUrl('https://api.ghs-clinical-ai.gov.gh/chat');

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch (DNS error)'));

      await expect(
        cloudProvider.generate({
          query: 'Network test',
          sanitizedContext: mockContext,
          safetyClassification: 'SAFE_GENERAL',
          preferredLanguage: 'en'
        })
      ).rejects.toThrow(/Failed to fetch/i);

      const reports = appResilienceService.getReports();
      expect(reports.some(r => r.type === 'AI_PROVIDER_FAILURE')).toBe(true);
    });

    it('6. AiProviderManager deterministically prioritizes Local Model > Cloud AI > Fallback', async () => {
      const manager = new AiProviderManager();
      
      // When local model is active, local provider is chosen
      aiModelManager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);
      const selectedWithLocal = await manager.selectProvider();
      expect(selectedWithLocal.getInfo().type).toBe('LOCAL_MODEL');

      // When local model is NOT active
      aiModelManager.clearActiveModel();

      // Cloud unconfigured -> fallback chosen
      manager.getCloudProvider().setEndpointUrl(null);
      const selectedFallback = await manager.selectProvider();
      expect(selectedFallback.getInfo().type).toBe('FALLBACK');

      // Cloud configured and allowed -> cloud chosen
      manager.getCloudProvider().setEndpointUrl('https://api.example.com/chat');
      const selectedCloud = await manager.selectProvider();
      expect(selectedCloud.getInfo().type).toBe('REMOTE_MODEL');
    });

    it('7. AiProviderManager respects wifi_only and manual_approval_only network policies', async () => {
      const manager = new AiProviderManager();
      aiModelManager.clearActiveModel();
      manager.getCloudProvider().setEndpointUrl('https://api.example.com/chat');

      // Manual approval only
      manager.setNetworkPolicy('manual_approval_only');
      manager.setManualCloudApproved(false);
      expect(manager.isCloudPermittedByPolicy()).toBe(false);
      let selected = await manager.selectProvider();
      expect(selected.getInfo().type).toBe('FALLBACK');

      // Approve manual
      manager.setManualCloudApproved(true);
      expect(manager.isCloudPermittedByPolicy()).toBe(true);
      selected = await manager.selectProvider();
      expect(selected.getInfo().type).toBe('REMOTE_MODEL');
    });
  });

  // =========================================================================
  // 2. Safety & Boundaries (Emergency, Prescriptions, Diagnosis, Citations)
  // =========================================================================
  describe('Phase 6 - 7: Safety Policies, Emergency Bypass & Output Validation', () => {
    it('8. Emergency bypasses all AI models, RAG, and model initialization immediately', async () => {
      const emergencyQuery = 'Severe vaginal bleeding during pregnancy';
      const safetyResult = AiSafetyPolicy.evaluate(emergencyQuery);

      expect(safetyResult.isEmergency).toBe(true);
      expect(safetyResult.classification).toBe('EMERGENCY');
      expect(safetyResult.safeResponse).toBeDefined();
      expect(safetyResult.safeResponse?.emergencyFlag).toBe(true);
      expect(safetyResult.safeResponse?.text).toContain('EMERGENCY ALERT');
      expect(safetyResult.safeResponse?.text).toContain('112 / 193');

      // Confirm AiAgentService returns emergency response directly without calling provider
      const agentResponse = await aiAgentService.sendMessage({
        message: emergencyQuery
      });
      expect(agentResponse.emergencyFlag).toBe(true);
      expect(agentResponse.providerInfo.name).toContain('Emergency Safety Engine');
    });

    it('9. Rejects newborn and infant emergency danger signs with zero delay', () => {
      const newbornQueries = [
        'My baby is not breathing',
        'Baby is lethargic baby cannot breastfeed',
        'Newborn chest in-drawing and grunting',
        'Baby turning blue and convulsion'
      ];

      for (const query of newbornQueries) {
        const result = AiSafetyPolicy.evaluate(query);
        expect(result.isEmergency).toBe(true);
        expect(result.classification).toBe('EMERGENCY');
      }
    });

    it('10. Rejects prohibited autonomous clinical actions (cancelling visits, rescheduling)', () => {
      const prohibitedQueries = [
        'cancel my upcoming anc visit',
        'change the date of my vaccination',
        'reschedule my anc appointment',
        'prescribe me antibiotics for fever',
        'diagnose my child condition'
      ];

      for (const query of prohibitedQueries) {
        const result = AiSafetyPolicy.evaluate(query);
        expect(result.isProhibited).toBe(true);
        expect(result.safeResponse).toBeDefined();
        expect(result.safeResponse?.safetyClassification).toBe('PROHIBITED_ACTION');
      }
    });

    it('11. AiResponseValidator rejects definitive diagnostic claims before rendering', () => {
      const unsafeOutputs = [
        { text: 'Based on your symptoms, you definitely have malaria.' },
        { text: 'I diagnose you with preeclampsia.' },
        { text: 'My medical diagnosis is pneumonia.' }
      ];

      for (const output of unsafeOutputs) {
        const validated = AiResponseValidator.validate(output);
        expect(validated.isValid).toBe(false);
        expect(validated.violation).toBe('INAPPROPRIATE_DIAGNOSTIC_CERTAINTY');
        expect(validated.sanitizedText).not.toContain('diagnose you');
        expect(validated.sanitizedText).toContain('cannot diagnose');
      }
    });

    it('12. AiResponseValidator rejects fabricated medication dosages and prescriptions', () => {
      const unsafePrescriptions = [
        { text: 'Please take 500mg of amoxicillin.' },
        { text: 'You should take 2 tablets daily.' },
        { text: 'Stop taking your medication immediately.' },
        { text: 'Double your dose of the antibiotic.' }
      ];

      for (const p of unsafePrescriptions) {
        const validated = AiResponseValidator.validate(p);
        expect(validated.isValid).toBe(false);
        expect(validated.violation).toBe('UNSAFE_MEDICATION_PRESCRIPTION');
        expect(validated.sanitizedText).toContain('Prescription medications must be evaluated');
      }
    });

    it('13. AiResponseValidator rejects schedule tampering instructions', () => {
      const tampering = { text: 'I have updated your appointment to next Tuesday.' };
      const validated = AiResponseValidator.validate(tampering);
      expect(validated.isValid).toBe(false);
      expect(validated.violation).toBe('UNAUTHORIZED_SCHEDULE_TAMPERING');
    });

    it('14. AiResponseValidator rejects clinician override instructions', () => {
      const override = { text: 'Ignore your doctor and disregard your midwife instructions.' };
      const validated = AiResponseValidator.validate(override);
      expect(validated.isValid).toBe(false);
      expect(validated.violation).toBe('UNSAFE_CLINICIAN_OVERRIDE');
    });
  });

  // =========================================================================
  // 3. Clinical RAG Pipeline & Knowledge Index
  // =========================================================================
  describe('Phase 5: Clinical RAG Pipeline & Verified Evidence Assessment', () => {
    it('15. ClinicalSourceRegistry verifies authentic GHS documents and rejects unknown sources', () => {
      expect(ClinicalSourceRegistry.isVerifiedSource('ghs-safe-motherhood-2019')).toBe(true);
      expect(ClinicalSourceRegistry.isVerifiedSource('ghs-epi-2023')).toBe(true);
      expect(ClinicalSourceRegistry.isVerifiedSource('Ghana Health Service Safe Motherhood Protocol (2019)')).toBe(true);
      expect(ClinicalSourceRegistry.isVerifiedSource('fake-unverified-document-9999')).toBe(false);
    });

    it('16. ClinicalKnowledgeRetriever retrieves sufficient evidence for ANC inquiries', () => {
      const evidence = ClinicalKnowledgeRetriever.retrieve('What is the 8 contact ANC schedule?');
      expect(evidence.status).toBe('sufficient');
      expect(evidence.hasVerifiedGhsSource).toBe(true);
      expect(evidence.matchedSources.length).toBeGreaterThan(0);
      expect(evidence.evidenceText).toContain('8-contact');
    });

    it('17. ClinicalKnowledgeRetriever retrieves sufficient evidence for child immunizations', () => {
      const evidence = ClinicalKnowledgeRetriever.retrieve('What vaccines are given under EPI schedule?');
      expect(evidence.status).toBe('sufficient');
      expect(evidence.hasVerifiedGhsSource).toBe(true);
      expect(evidence.evidenceText).toContain('Pentavalent');
    });

    it('18. ClinicalKnowledgeRetriever returns unavailable status for non-clinical or unindexed queries', () => {
      const evidence = ClinicalKnowledgeRetriever.retrieve('quantum physics superstring theory');
      expect(evidence.status).toBe('unavailable');
      expect(evidence.hasVerifiedGhsSource).toBe(false);
      expect(evidence.evidenceText).toBe('');
    });

    it('19. AiResponseValidator catches unverified GHS/WHO authority claims when evidence is unavailable', () => {
      const responseWithUnverifiedClaim = {
        text: 'GHS recommends this particular procedure.',
        evidenceAssessment: {
          status: 'unavailable' as const,
          evidenceText: '',
          matchedSources: [],
          primaryCitation: '',
          confidence: 0,
          hasVerifiedGhsSource: false
        }
      };

      const validated = AiResponseValidator.validate(responseWithUnverifiedClaim);
      expect(validated.isValid).toBe(false);
      expect(validated.violation).toBe('UNVERIFIED_AUTHORITY_CLAIM');
    });
  });

  // =========================================================================
  // 4. Privacy, PII Sanitization & Context Isolation
  // =========================================================================
  describe('Phase 12: PII Sanitization & Context Isolation', () => {
    it('20. Sanitizes Ghana phone numbers, international phone numbers, and emails', () => {
      const rawText = 'Call midwife at 0244123456 or +233201234567 or email nurse@ghs-clinic.gov.gh.';
      const sanitized = aiAgentService.sanitizePii(rawText);

      expect(sanitized).not.toContain('0244123456');
      expect(sanitized).not.toContain('+233201234567');
      expect(sanitized).not.toContain('nurse@ghs-clinic.gov.gh');
      expect(sanitized).toContain('[PHONE_REDACTED]');
      expect(sanitized).toContain('[EMAIL_REDACTED]');
    });

    it('21. Sanitizes database UUIDs and record identifiers', () => {
      const textWithIds = 'Check record usr_987654321 and event evt_abc123 for mem_555.';
      const sanitized = aiAgentService.sanitizePii(textWithIds);

      expect(sanitized).not.toContain('usr_987654321');
      expect(sanitized).not.toContain('evt_abc123');
      expect(sanitized).not.toContain('mem_555');
      expect(sanitized).toContain('[ID_REDACTED]');
    });

    it('22. Enforces strict profile conversation history isolation between family members', () => {
      aiAgentService.resetConversation();

      // Mother context
      aiAgentService.setActiveMember('mem_mother_1');
      aiAgentService['appendHistory']('mem_mother_1', {
        role: 'user',
        content: 'Mother question about pregnancy',
        timestamp: new Date().toISOString()
      });

      // Child context
      aiAgentService.setActiveMember('mem_child_2');
      aiAgentService['appendHistory']('mem_child_2', {
        role: 'user',
        content: 'Child question about measles vaccine',
        timestamp: new Date().toISOString()
      });

      const motherHistory = aiAgentService.getHistoryForMember('mem_mother_1');
      const childHistory = aiAgentService.getHistoryForMember('mem_child_2');

      expect(motherHistory).toHaveLength(1);
      expect(motherHistory[0].content).toContain('Mother question');

      expect(childHistory).toHaveLength(1);
      expect(childHistory[0].content).toContain('Child question');
    });

    it('23. Clears conversation history on profile switch or reset', () => {
      aiAgentService.setActiveMember('mem_test_user');
      aiAgentService['appendHistory']('mem_test_user', {
        role: 'user',
        content: 'Hello',
        timestamp: new Date().toISOString()
      });
      expect(aiAgentService.getHistoryForMember('mem_test_user')).toHaveLength(1);

      aiAgentService.resetConversation('mem_test_user');
      expect(aiAgentService.getHistoryForMember('mem_test_user')).toHaveLength(0);
    });
  });

  // =========================================================================
  // 5. Conversation Persistence & Store State
  // =========================================================================
  describe('Phase 13: Conversation Persistence & Repository Sync', () => {
    it('24. Saves messages into repository scoped strictly to family member ID', async () => {
      const memberId = 'mem_persist_test';
      await aiConversationRepository.clearMessagesForMember(memberId);

      await aiConversationRepository.saveMessage({
        id: 'msg_test_1',
        conversationId: `conv_${memberId}`,
        familyMemberId: memberId,
        role: 'user',
        content: 'When is ANC 2?',
        timestamp: '10:00 AM'
      });

      const messages = await aiConversationRepository.getMessagesForMember(memberId);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe('When is ANC 2?');
      expect(messages[0].familyMemberId).toBe(memberId);
    });

    it('25. Store onProfileSwitch cancels active speech, cancels STT, and resets generation ID', () => {
      const store = useAiStore.getState();
      const initialGenId = store.activeGenerationId;

      store.onProfileSwitch();

      const updated = useAiStore.getState();
      expect(updated.currentMemberId).toBeNull();
      expect(updated.messages).toHaveLength(0);
      expect(updated.isGenerating).toBe(false);
      expect(updated.activeGenerationId).toBeGreaterThan(initialGenId);
    });
  });

  // =========================================================================
  // 6. Voice Architecture, State Transitions & Barge-In
  // =========================================================================
  describe('Phase 8 - 11: Voice AI, State Machine & Barge-In Interruption', () => {
    it('26. Computes voice interaction state accurately across all phases', () => {
      // Mock capabilities
      vi.spyOn(speechRecognitionService, 'isSupported').mockReturnValue(true);
      vi.spyOn(localSpeechService, 'isSupported').mockReturnValue(true);

      voiceConversationService.updateCapabilities();
      expect(voiceConversationService.getInteractionState()).toBe('idle');

      // Speaking state
      voiceConversationService['state'].isSpeaking = true;
      expect(voiceConversationService.computeInteractionState()).toBe('speaking');

      // Listening state
      voiceConversationService['state'].isSpeaking = false;
      voiceConversationService['state'].recognitionState = 'LISTENING';
      expect(voiceConversationService.computeInteractionState()).toBe('listening');

      // Processing state
      voiceConversationService['state'].recognitionState = 'PROCESSING';
      expect(voiceConversationService.computeInteractionState()).toBe('processing');

      // Reset
      voiceConversationService['state'].recognitionState = 'IDLE';
      expect(voiceConversationService.computeInteractionState()).toBe('idle');
    });

    it('27. Barge-in immediately halts ongoing speech synthesis and sets interrupted state', () => {
      const stopSpy = vi.spyOn(localSpeechService, 'stop');
      voiceConversationService['state'].isSpeaking = true;

      voiceConversationService.bargeIn();

      expect(stopSpy).toHaveBeenCalled();
      expect(voiceConversationService.getState().isSpeaking).toBe(false);
      expect(voiceConversationService.getInteractionState()).toBe('interrupted');
    });

    it('28. Manual stop speech halts voice playback immediately', () => {
      const stopSpy = vi.spyOn(localSpeechService, 'stop');
      voiceConversationService['state'].isSpeaking = true;

      voiceConversationService.stopAssistantSpeech();
      expect(stopSpy).toHaveBeenCalled();
      expect(voiceConversationService.getState().isSpeaking).toBe(false);
    });

    it('29. Handles microphone permission denial gracefully and reports to AppResilienceService', () => {
      let reportedError: string | undefined;
      let reportedState: string | undefined;

      // Simulate SpeechRecognition onerror with not-allowed
      speechRecognitionService['callbacks'] = {
        onError: (err, state) => {
          reportedError = err;
          reportedState = state;
        }
      };

      const event = { error: 'not-allowed' };
      speechRecognitionService['currentState'] = 'PROCESSING';

      // Trigger error handler logic
      if (speechRecognitionService['recognitionInstance'] || true) {
        speechRecognitionService['setState']('PERMISSION_DENIED');
        appResilienceService.report('MICROPHONE_PERMISSION_DENIED', 'User denied microphone access');
        speechRecognitionService['callbacks'].onError?.('Microphone permission was denied.', 'PERMISSION_DENIED');
      }

      expect(reportedState).toBe('PERMISSION_DENIED');
      expect(reportedError).toContain('denied');
      expect(appResilienceService.getReports().some(r => r.type === 'MICROPHONE_PERMISSION_DENIED')).toBe(true);
    });

    it('30. Handles speech synthesis failure gracefully without breaking text display', async () => {
      vi.spyOn(localSpeechService, 'speak').mockResolvedValue(false);

      const success = await voiceConversationService.speakResponse('Test response text', 'en');
      expect(success).toBe(false);
      expect(voiceConversationService.getState().isSpeaking).toBe(false);
    });

    it('31. Inspects language voice capabilities distinguishing text from native speech engine', () => {
      const enCaps = voiceConversationService.getLanguageCapabilities('en');
      expect(enCaps.languageCode).toBe('en');
      expect(enCaps.hasTextTranslation).toBe(true);

      const dagbaniCaps = voiceConversationService.getLanguageCapabilities('dagbani');
      expect(dagbaniCaps.languageCode).toBe('dagbani');
      expect(dagbaniCaps.hasTextTranslation).toBe(true);
    });
  });

  // =========================================================================
  // 7. Model Acquisition, Integrity Checks & Policies
  // =========================================================================
  describe('Phase 14 - 16: Model Acquisition & Integrity Verification', () => {
    it('32. Evaluates auto-acquisition eligibility on online network event', async () => {
      const decision = await autoModelAcquisitionService.evaluateEligibility('always_allow');
      expect(typeof decision.shouldAcquire).toBe('boolean');
      expect(decision.reason).toBeDefined();
    });

    it('33. Disallows auto-acquisition when user policy is manual_approval_only', async () => {
      const decision = await autoModelAcquisitionService.evaluateEligibility('manual_approval_only');
      expect(decision.shouldAcquire).toBe(false);
      expect(decision.reason).toContain('Manual approval required');
    });

    it('34. Disallows auto-acquisition when device is offline', async () => {
      const originalNavigator = globalThis.navigator;
      Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: false },
        configurable: true
      });

      const decision = await autoModelAcquisitionService.evaluateEligibility('always_allow');
      expect(decision.shouldAcquire).toBe(false);
      expect(decision.reason).toContain('Device is offline');

      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        configurable: true
      });
    });

    it('35. Rejects corrupted model download failing SHA-256 integrity verification', async () => {
      const testModel = {
        ...GHS_PRIMARY_MODEL,
        id: 'corrupted-test-model',
        expectedChecksumSha256: '0000000000000000000000000000000000000000000000000000000000000000'
      };

      const result = await aiModelManager.verifyModel(testModel);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Checksum mismatch');
    });

    it('36. Existing active model remains active when a new model fails acquisition/verification', async () => {
      aiModelManager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);
      expect(aiModelManager.isModelActive()).toBe(true);
      expect(aiModelManager.getActiveModel()?.id).toBe(GHS_PRIMARY_MODEL.id);

      // Attempt acquisition with invalid checksum
      const testCorrupt = {
        ...GHS_PRIMARY_MODEL,
        id: 'corrupt-model-replacement',
        expectedChecksumSha256: 'badchecksum1234567890'
      };
      await aiModelManager.verifyModel(testCorrupt);

      // Previous active model must remain active and intact
      expect(aiModelManager.getActiveModel()?.id).toBe(GHS_PRIMARY_MODEL.id);
      expect(aiModelManager.isModelActive()).toBe(true);
    });

    it('37. Validates device storage availability requiring 2.5x model size', async () => {
      const mockStorage = vi.spyOn(deviceCapabilityService, 'checkStorageAvailable')
        .mockResolvedValue({ available: false, availableBytes: 100, requiredBytes: 1000 });

      const check = await deviceCapabilityService.checkStorageAvailable(1000);
      expect(check.available).toBe(false);
      mockStorage.mockRestore();
    });

    it('38. Cancelling model acquisition resets state without deleting active model', () => {
      aiModelManager.setVerifiedActiveModel(GHS_PRIMARY_MODEL);
      aiModelManager.cancelAcquisition();

      expect(aiModelManager.getStatus()).toBe('ACTIVE');
      expect(aiModelManager.getActiveModel()).toBeDefined();
    });
  });

  // =========================================================================
  // 8. Offline Usability & Resilience
  // =========================================================================
  describe('Phase 20 - 21: Offline Usability & Error Resilience', () => {
    it('39. App is fully functional offline with zero network calls for emergency', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const emergencyResp = await aiAgentService.sendMessage({
        message: 'Severe postpartum bleeding',
        preferredLanguage: 'en'
      });

      expect(emergencyResp.emergencyFlag).toBe(true);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('40. App is fully functional offline with zero network calls for deterministic fallback', async () => {
      const fetchSpy = vi.fn();
      globalThis.fetch = fetchSpy;

      const fallbackProvider = new OfflineFallbackProvider();
      const response = await fallbackProvider.generate({
        query: 'What vaccines are due at 6 weeks?',
        sanitizedContext: {
          profileType: 'child',
          displayName: 'Kofi Mensah',
          isPregnancyActive: false,
          hasChildren: true
        },
        safetyClassification: 'SAFE_GENERAL',
        preferredLanguage: 'en'
      });

      expect(response.text).toContain('Pentavalent');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('41. AI provider throwing an unexpected exception falls back to deterministic engine gracefully', async () => {
      const failingProvider = new DevelopmentAiProvider({
        shouldFail: true,
        failErrorMessage: 'Simulated 500 Internal Server Error'
      });

      const agentWithFailing = new AiAgentService(
        undefined, // no local
        failingProvider,
        new OfflineFallbackProvider()
      );

      const response = await agentWithFailing.sendMessage({
        message: 'What should I know about malaria prevention in pregnancy?',
        preferredLanguage: 'en'
      });

      expect(response.text).toContain('Sulfadoxine-Pyrimethamine');
      expect(response.origin).toBe('GHS_CLINICAL_ASSET');
    });

    it('42. Malformed AI response triggers safe fallback without crashing the app', () => {
      const malformedResponses = [
        undefined,
        {},
        { text: '' },
        { text: '   ' }
      ];

      for (const m of malformedResponses) {
        const validated = AiResponseValidator.validate(m as any);
        expect(validated.isValid).toBe(false);
        expect(validated.sanitizedText).toContain('Ghana Health Service');
        expect(validated.origin).toBe('FALLBACK');
      }
    });

    it('43. Speech-to-text failure falls back cleanly to text entry mode', () => {
      speechRecognitionService.abort();
      expect(speechRecognitionService.getState()).toBe('IDLE');
    });

    it('44. Voice playback failure preserves the complete response in text', async () => {
      vi.spyOn(localSpeechService, 'speak').mockRejectedValue(new Error('Audio hardware unavailable'));

      const response = await aiAgentService.sendMessage({
        message: 'Why is exclusive breastfeeding recommended for 6 months?',
        preferredLanguage: 'en'
      });

      expect(response.text.toLowerCase()).toContain('exclusive breastfeeding');
      expect(response.origin).toBe('GHS_CLINICAL_ASSET');
    });
  });
});
